"""FastAPI application entry point for Flight Tracking AI Service."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time
import uuid
import logging

from app.config import get_settings
from app.api.health import router as health_router
from app.api.chat import router as chat_router
from app.api.rag import router as rag_router
from app.api.recommendation import router as recommendation_router
from app.api.memory import router as memory_router
from app.api.atc import router as atc_router
from app.api.observability import router as observability_router
from app.api.predictions import router as predictions_router
from app.observability.logging import setup_logging
from app.observability.context import get_or_create_request_id, clear_request_id, get_request_id
from app.observability import tracer

settings = get_settings()

setup_logging(settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s", settings.service_name)

    # Register all tools
    from app.tools import register_all_tools
    register_all_tools()
    from app.tools.registry import registry
    logger.info("Registered %d tools: %s", len(registry), registry.tool_names)

    # Register MCP tools (bridges to the same tool registry)
    from app.mcp import register_mcp_tools
    register_mcp_tools()

    # Load delay prediction model
    from app.prediction.model_loader import get_model_loader
    model_loader = get_model_loader()
    if model_loader.load():
        logger.info(
            "Delay prediction model loaded successfully: %s",
            model_loader.model_version,
        )
    else:
        logger.error(
            "Delay prediction model failed to load; predictions will be unavailable."
        )

    yield

    # Clean up resources on shutdown
    try:
        from app.tools.client import close_client
        await close_client()
    except Exception:
        pass
    try:
        from app.rag.store import close_pool
        await close_pool()
    except Exception:
        pass
    try:
        from app.memory.store import close_pool as close_memory_pool
        await close_memory_pool()
    except Exception:
        pass
    try:
        from app.api.chat import _llm_client
        if _llm_client:
            await _llm_client.close()
    except Exception:
        pass
    logger.info("Shutting down %s", settings.service_name)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Flight Tracking AI Service",
        description="AI backend for Flight Tracking application",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if get_settings().environment != "production" else None,
        redoc_url="/redoc" if get_settings().environment != "production" else None,
    )

    cors_origins = [origin.strip() for origin in get_settings().cors_origins.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Combined middleware: request ID + AI service key validation + user identity + observability
    @app.middleware("http")
    async def process_request(request: Request, call_next):
        incoming = request.headers.get("X-Request-ID")
        request_id = get_or_create_request_id(incoming)
        request.state.request_id = request_id
        # Init per-request event buffer
        tracer.init_request(request_id)

        # Extract user identity from Spring Boot forwarded header
        user_id = request.headers.get("X-User-Id")
        request.state.user_id = user_id

        # Validate AI service key for /api/ routes (including observability metrics)
        cfg = get_settings()
        if cfg.ai_service_api_key and request.url.path.startswith("/api/"):
            key = request.headers.get("X-AI-Service-Key")
            if key != cfg.ai_service_api_key:
                return JSONResponse(
                    status_code=401,
                    content={
                        "error": "UNAUTHORIZED",
                        "message": "Invalid or missing AI service key",
                        "request_id": request_id,
                    },
                )

        # Record request_started for AI routes
        is_ai = request.url.path.startswith("/api/ai")
        if is_ai:
            route = request.url.path
            # Infer operation from path
            op = route
            if "/chat" in route:
                op = "chat"
            elif "/recommend" in route:
                op = "recommendation"
            elif "/atc" in route:
                op = "atc_explain"
            elif "/rag" in route:
                op = "rag"
            elif "/memory" in route:
                op = "memory"
            tracer.record_request_started(request_id, op, route=route)

        start_time = time.perf_counter()
        start_mono = tracer.start_timer()
        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = tracer.elapsed_ms(start_mono)
            if is_ai:
                tracer.record_request_failed(request_id, op, duration_ms, error_category="unhandled_exception")
            raise
        process_time = time.perf_counter() - start_time
        duration_ms = tracer.elapsed_ms(start_mono)

        # Record completion
        if is_ai:
            status_code = getattr(response, "status_code", 200)
            status = "success" if status_code < 400 else "failure"
            tracer.record_request_completed(request_id, op, duration_ms, status=status, http_status=status_code)

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{process_time:.4f}"
        return response

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", "unknown")
        logger.exception("Unhandled exception: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": "INTERNAL_SERVER_ERROR",
                "message": "An internal server error occurred",
                "request_id": request_id,
            },
        )

    app.include_router(health_router)
    app.include_router(chat_router, prefix="/api/ai")
    app.include_router(rag_router, prefix="/api/ai")
    app.include_router(recommendation_router, prefix="/api/ai")
    app.include_router(memory_router, prefix="/api/ai")
    app.include_router(atc_router, prefix="/api/ai")
    app.include_router(observability_router, prefix="/api/ai")
    app.include_router(predictions_router, prefix="/api")

    # Mount MCP server (SSE transport) at /mcp
    try:
        from app.mcp.server import get_mcp_sse_app
        mcp_sse_app = get_mcp_sse_app()
        app.mount("/mcp", mcp_sse_app)
        logger.info("MCP server mounted at /mcp (SSE transport)")
    except Exception as e:
        logger.warning("Failed to mount MCP server: %s", e)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower(),
    )
