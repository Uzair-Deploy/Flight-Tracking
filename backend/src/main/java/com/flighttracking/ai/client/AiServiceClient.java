package com.flighttracking.ai.client;

import com.flighttracking.ai.dto.AiHealthResponse;
import com.flighttracking.ai.dto.AtcExplanationRequest;
import com.flighttracking.ai.dto.AtcExplanationResponse;
import com.flighttracking.ai.dto.ChatRequest;
import com.flighttracking.ai.dto.ChatResponse;
import com.flighttracking.ai.dto.RecommendationRequest;
import com.flighttracking.dto.prediction.DelayPredictionRequest;
import com.flighttracking.dto.prediction.DelayPredictionResponse;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Map;

@Component
public class AiServiceClient {

    private static final Logger log = LoggerFactory.getLogger(AiServiceClient.class);

    private final RestClient restClient;

    public AiServiceClient(RestClient aiServiceRestClient) {
        this.restClient = aiServiceRestClient;
    }

    public AiHealthResponse healthCheck() {
        try {
            log.debug("Checking AI service health");
            AiHealthResponse response = restClient.get()
                    .uri("/health")
                    .retrieve()
                    .body(AiHealthResponse.class);

            if (response == null) {
                throw new ExternalApiException("Empty response from AI service", 502);
            }
            return response;
        } catch (RestClientException e) {
            log.error("AI service health check failed: {}", e.getMessage());
            throw new ExternalApiException("Failed to connect to AI service: " + e.getMessage(), e);
        }
    }

    public ChatResponse chat(ChatRequest request, String userId, String requestId) {
        try {
            log.debug("Sending chat request to AI service");
            var builder = restClient.post()
                    .uri("/api/ai/chat")
                    .header("X-User-Id", userId != null ? userId : "anonymous");
            if (requestId != null && !requestId.isBlank()) {
                builder = builder.header("X-Request-ID", requestId);
            }
            ChatResponse response = builder
                    .body(request)
                    .retrieve()
                    .body(ChatResponse.class);

            if (response == null) {
                throw new ExternalApiException("Empty response from AI service", 502);
            }
            return response;
        } catch (RestClientException e) {
            log.error("AI service chat request failed: {}", e.getMessage());
            throw new ExternalApiException("AI service error: " + e.getMessage(), e);
        }
    }

    // Backwards-compatible overload
    public ChatResponse chat(ChatRequest request, String userId) {
        return chat(request, userId, null);
    }

    public AtcExplanationResponse explainAnomaly(AtcExplanationRequest request, String userId, String requestId) {
        try {
            log.debug("Sending ATC explanation request to AI service for anomaly {}", request.anomalyId());
            var builder = restClient.post()
                    .uri("/api/ai/atc/explain")
                    .header("X-User-Id", userId != null ? userId : "anonymous");
            if (requestId != null && !requestId.isBlank()) {
                builder = builder.header("X-Request-ID", requestId);
            }
            AtcExplanationResponse response = builder
                    .body(request)
                    .retrieve()
                    .body(AtcExplanationResponse.class);

            if (response == null) {
                throw new ExternalApiException("Empty response from AI service", 502);
            }
            return response;
        } catch (RestClientException e) {
            log.error("AI service ATC explanation request failed: {}", e.getMessage());
            throw new ExternalApiException("AI service error: " + e.getMessage(), e);
        }
    }

    // Backwards-compatible overload
    public AtcExplanationResponse explainAnomaly(AtcExplanationRequest request, String userId) {
        return explainAnomaly(request, userId, null);
    }

    public Map<String, Object> recommend(RecommendationRequest request, String userId, String requestId) {
        try {
            log.debug("Sending recommendation request to AI service");
            var builder = restClient.post()
                    .uri("/api/ai/recommend")
                    .header("X-User-Id", userId != null ? userId : "anonymous");
            if (requestId != null && !requestId.isBlank()) {
                builder = builder.header("X-Request-ID", requestId);
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> response = builder
                    .body(request)
                    .retrieve()
                    .body(Map.class);

            if (response == null) {
                throw new ExternalApiException("Empty response from AI service", 502);
            }
            return response;
        } catch (RestClientException e) {
            log.error("AI service recommend request failed: {}", e.getMessage());
            throw new ExternalApiException("AI service error: " + e.getMessage(), e);
        }
    }

    // Backwards-compatible overload
    public Map<String, Object> recommend(RecommendationRequest request, String userId) {
        return recommend(request, userId, null);
    }

    public DelayPredictionResponse predictDelay(DelayPredictionRequest request, String userId, String requestId) {
        try {
            log.debug("Sending delay prediction request to AI service");
            var builder = restClient.post()
                    .uri("/api/predictions/delay")
                    .header("X-User-Id", userId != null ? userId : "anonymous");
            if (requestId != null && !requestId.isBlank()) {
                builder = builder.header("X-Request-ID", requestId);
            }
            DelayPredictionResponse response = builder
                    .body(request)
                    .retrieve()
                    .body(DelayPredictionResponse.class);

            if (response == null) {
                throw new ExternalApiException("Empty response from AI service", 502);
            }
            return response;
        } catch (RestClientException e) {
            log.error("AI service delay prediction request failed: {}", e.getMessage());
            throw new ExternalApiException("AI service error: " + e.getMessage(), e);
        }
    }

    // Backwards-compatible overload
    public DelayPredictionResponse predictDelay(DelayPredictionRequest request, String userId) {
        return predictDelay(request, userId, null);
    }
}