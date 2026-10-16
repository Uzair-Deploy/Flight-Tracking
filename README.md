# Flight Tracking

A full-stack flight-tracking application for searching flights, viewing available tracking information, exploring airports, checking weather, and accessing aviation-focused AI features. The project uses a React frontend, a Spring Boot backend, and a separate FastAPI service for AI-related functionality.

**Repository:** [uzair007mansari-create/Flight-Tracking](https://github.com/uzair007mansari-create/Flight-Tracking)  
**Frontend demo:** https://flight-tracking-red.vercel.app/

> **Scope:** This README describes the original project structure and features on the repository's `main` branch, before the separate flight-delay model improvement work. It does not imply that a dedicated trained flight-delay prediction model is already connected to the live website.

## Features

### Flight search and tracking
- Search by flight identifier, departure airport, arrival airport, airline, or flight status.
- View flight details and request tracking information or telemetry when the data provider makes it available.
- Display route and location information on an interactive map.
- Use multiple external aviation-data providers where configured.

### Airport explorer
- Search airports by IATA/ICAO code, name, or city.
- View airport details and available arrivals and departures.
- Explore nearby airport infrastructure using OpenStreetMap-based data.

### Weather
- Retrieve weather information by geographic coordinates or airport code.
- Integrate with Open-Meteo and optional weather providers, subject to configuration and provider availability.

### Accounts and bookings
- Register and log in using the backend's authentication endpoints.
- Use JWT-based authentication and protected pages.
- Access booking-related functionality and external booking-link/search integrations.
- Access profile and role-protected air-traffic-control (ATC) pages.

### Aviation AI service
The separate AI service contains modules for aviation chat, recommendations, ATC/anomaly explanations, retrieval-augmented generation (RAG), tool/agent orchestration, memory, guardrails, evaluation, and observability. The extent of each feature depends on configuration, available providers, and service readiness.

## Technology stack

| Layer | Main technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, Tailwind CSS, Leaflet and React Leaflet |
| Application backend | Java 21, Spring Boot 3.4.x, Spring Web, Spring Data JPA, Spring Security, JWT |
| Database and migrations | PostgreSQL, Hibernate/JPA, Flyway |
| AI service | Python 3.11+, FastAPI, Uvicorn, Pydantic, HTTPX, LangGraph and MCP-related modules |
| Maps and external data | OpenStreetMap, AviationStack, AeroDataBox, OpenSky Network, AirLabs and weather/aviation providers |
| API documentation | Springdoc OpenAPI / Swagger UI |

External integrations are optional or credential-dependent. Results and coverage depend on API keys, provider terms, rate limits, connectivity, and the availability of live data.

## Architecture

```text
React + TypeScript frontend
          |
          | HTTP / REST
          v
Spring Boot backend
  |       |          |
  |       |          +---- PostgreSQL (JPA + Flyway)
  |       |
  |       +--------------- Aviation, airport and weather providers
  |
  +----------------------- FastAPI AI service
                              |
                              +-- LLM provider
                              +-- RAG / knowledge sources
                              +-- Tools, agents and MCP integrations
```

The Spring Boot service is the main application backend. The AI service runs separately and is called by the backend over HTTP.

## Repository structure

```text
Flight-Tracking/
├── frontend/                 # React + TypeScript user interface
│   ├── src/pages/             # Home, tracking, airport, booking, AI and ATC pages
│   ├── src/components/        # Shared UI, maps and aircraft components
│   ├── src/services/          # Frontend API clients
│   └── package.json
├── backend/                  # Spring Boot REST API
│   ├── src/main/java/         # Controllers, services, DTOs, clients and security
│   ├── src/main/resources/    # Application configuration and Flyway migrations
│   ├── src/test/              # Backend tests
│   ├── pom.xml
│   └── README.md
├── ai-service/               # FastAPI service for AI features
│   ├── app/                   # API, agents, RAG, LLM, tools, memory and guardrails
│   ├── tests/
│   ├── requirements.txt
│   └── README.md
└── docs/                     # AI architecture, API contracts and provider notes
```

## Local development

Run the frontend, Spring Boot backend, and AI service as separate processes. The AI service is mainly needed for the AI-related features.

### Prerequisites

- A recent Node.js release and npm compatible with the frontend's Vite version.
- Java 21.
- PostgreSQL, either locally or through a compatible hosted database such as Supabase.
- Python 3.11 or newer for the AI service.
- API credentials for whichever external providers and LLM service you plan to use.

### 1. Configure the backend

The backend reads its configuration from environment variables. `backend/.env.example` documents the available settings; a `.env` file is not automatically loaded by every Java launch method, so make sure the values are available to your shell, IDE, or deployment environment.

At minimum, configure the PostgreSQL connection:

- `DATABASE_URL`
- `DATABASE_USERNAME`
- `DATABASE_PASSWORD`

The local defaults target a PostgreSQL database named `flight_tracking`. Ensure the database exists before starting the application. For Supabase, use the appropriate JDBC connection string and enable SSL with `sslmode=require`.

Configure provider keys as required, such as AeroDataBox, OpenSky Network, AviationStack, AirLabs, Ignav, or optional weather providers. In production, set a strong unique `JWT_SECRET` and configure `CORS_ALLOWED_ORIGINS` for the actual frontend origin.

Start the backend from the `backend` directory:

**Windows**
```powershell
.\mvnw.cmd spring-boot:run
```

**macOS/Linux**
```bash
./mvnw spring-boot:run
```

The default server port is `8080`. Flyway manages database migrations during startup.

### 2. Configure the AI service

The AI service uses `ai-service/.env.example` as its configuration reference. Set `SPRING_BOOT_BASE_URL` to the backend address. If shared-key authentication is enabled, configure the same `AI_SERVICE_API_KEY` for the AI service and the Spring Boot backend. Configure the LLM provider and `LLM_API_KEY` as applicable.

From the `ai-service` directory, create and activate a Python virtual environment, install the dependencies in `requirements.txt`, and start the FastAPI app:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

The default AI service port is `8001`. Its health endpoint is `GET /health`.

### 3. Configure and start the frontend

Install the frontend dependencies from the `frontend` directory. Use `frontend/.env.example` as the reference for environment variables, and set:

- `VITE_API_BASE_URL` — Spring Boot backend base URL; defaults to `http://localhost:8080`.

Start the Vite development server:

```bash
npm run dev
```

Vite normally serves the local frontend at `http://localhost:5173`. The frontend is configured to call the backend via the URL in `VITE_API_BASE_URL`.

### 4. Verify the services

- Frontend: `http://localhost:5173`
- Spring Boot health endpoint: `http://localhost:8080/api/health`
- Spring Boot OpenAPI docs: `http://localhost:8080/swagger-ui.html`
- Spring Boot OpenAPI schema: `http://localhost:8080/v3/api-docs`
- AI service health endpoint: `http://localhost:8001/health`

These addresses assume the default local ports have not been changed.

## Main API areas

The backend exposes REST endpoints for the following areas. Use Swagger UI for the live API schema and exact request/response details.

| Area | Example routes | Purpose |
|---|---|---|
| Authentication | `POST /api/auth/register`, `POST /api/auth/login` | Account registration and login |
| Flights | `GET /api/flights/search`, `GET /api/flights/{flightNumber}`, `GET /api/flights/{flightNumber}/tracking` | Flight search, details and tracking |
| Airports | `GET /api/airports/search`, `GET /api/airports/{iata}`, `GET /api/airports/{iata}/arrivals`, `GET /api/airports/{iata}/departures` | Airport search and flight information |
| Weather | `GET /api/weather`, `GET /api/weather/airport/{iata}` | Weather information |
| Bookings | `/api/bookings` | Booking-related operations |
| ATC | `/api/atc/telemetry`, `/api/atc/anomalies` | Telemetry and anomaly workflows |
| AI proxy | `/api/ai/chat`, `/api/ai/recommend` | AI chat and recommendations |
| External booking search | `/api/ignav/search`, `/api/ignav/booking-links` | Flight search and booking-link integration |

Some endpoints require authentication or role permissions. Provider-backed endpoints may return limited results or errors if API credentials, data coverage, or service connectivity are unavailable.

## Frontend routes

The React application includes these main routes:

- `/` — home and flight search
- `/tracking` — flight search and tracking
- `/airports` and `/airports/:iata` — airport explorer and details
- `/aircraft` — aircraft view
- `/booking` — protected booking area
- `/ai` — aviation AI interface
- `/atc` — role-protected ATC tools
- `/profile` — authenticated user profile
- `/login` and `/register` — account access

Availability and functionality depend on the backend and required external services being configured and running.

## Database and migrations

PostgreSQL stores application data. Spring Data JPA manages persistence, and Flyway is used for versioned schema migrations. Schema changes should be added as new Flyway migration files under `backend/src/main/resources/db/migration` rather than being made manually in production.

The backend tests use an isolated H2 test database where configured. See `backend/README.md` for more backend-specific details.

## Testing and API exploration

- Backend tests are located under `backend/src/test`.
- AI service tests are located under `ai-service/tests`.
- The backend's Swagger UI provides an interactive view of the REST API.
- The AI service exposes FastAPI's API documentation when enabled by its app configuration.

## Security and configuration notes

- Never commit real API keys, database passwords, JWT secrets, or LLM credentials.
- Keep provider and LLM secrets in backend/service environment variables, not in frontend variables.
- Use a strong, unique `JWT_SECRET` in production.
- Restrict CORS origins to the deployed frontend.
- Treat live tracking, weather and AI output as dependent on external services; handle missing or stale results clearly.
- Review each provider's API terms, availability and rate limits before deployment.

## Current scope and limitations

The application combines live-flight search/tracking, airport and weather data, accounts and booking-related workflows, ATC/telemetry features, and a separate AI service. Not every integration is guaranteed to work without provider credentials or external service availability.

This README describes the project as it existed on the original `main` branch before the separate model-improvement work. It does not document or claim the availability of a dedicated trained flight-delay prediction model.
