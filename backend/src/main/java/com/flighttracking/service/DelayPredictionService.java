package com.flighttracking.service;

import com.flighttracking.ai.client.AiServiceClient;
import com.flighttracking.dto.flight.FlightDto;
import com.flighttracking.dto.prediction.DelayPredictionRequest;
import com.flighttracking.dto.prediction.DelayPredictionResponse;
import com.flighttracking.exception.ExternalApiException;
import com.flighttracking.util.FlightNumberUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;

@Service
public class DelayPredictionService {

    private static final Logger log = LoggerFactory.getLogger(DelayPredictionService.class);

    private final AiServiceClient aiServiceClient;
    private final FlightService flightService;

    public DelayPredictionService(AiServiceClient aiServiceClient, FlightService flightService) {
        this.aiServiceClient = aiServiceClient;
        this.flightService = flightService;
    }

    public DelayPredictionResponse getDelayPrediction(String flightNumber) {
        if (flightNumber == null || flightNumber.isBlank()) {
            throw new IllegalArgumentException("flightNumber must not be blank");
        }

        String normalized = FlightNumberUtils.normalize(flightNumber);

        FlightDto flight = null;
        try {
            flight = flightService.getByFlightNumber(normalized);
        } catch (Exception e) {
            log.warn("Could not fetch flight context for {}: {}", normalized, e.getMessage());
        }

        DelayPredictionRequest request = buildRequest(normalized, flight);

        try {
            DelayPredictionResponse response = aiServiceClient.predictDelay(request, null, null);
            if (response == null) {
                return unavailableResponse();
            }
            return response;
        } catch (ExternalApiException e) {
            log.error("AI service delay prediction failed for {}: {}", normalized, e.getMessage());
            return unavailableResponse();
        } catch (Exception e) {
            log.error("Unexpected error during delay prediction for {}: {}", normalized, e.getMessage());
            return unavailableResponse();
        }
    }

    private DelayPredictionRequest buildRequest(String flightNumber, FlightDto flight) {
        String scheduledDeparture = null;
        String carrier = null;
        String origin = null;
        String destination = null;
        Integer distanceKm = null;

        if (flight != null) {
            scheduledDeparture = flight.departureScheduled();
            carrier = flight.airlineIata();
            origin = flight.departureIata();
            destination = flight.arrivalIata();
        }

        return new DelayPredictionRequest(
                flightNumber,
                scheduledDeparture,
                carrier,
                origin,
                destination,
                distanceKm,
                null,
                null,
                "1"
        );
    }

    private DelayPredictionResponse unavailableResponse() {
        return new DelayPredictionResponse(
                0.0,
                0.0,
                Instant.now().toString(),
                "unavailable",
                "UNAVAILABLE"
        );
    }
}