package com.flighttracking.dto.prediction;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record DelayPredictionRequest(
        @NotBlank(message = "flightNumber is required")
        @Size(max = 20, message = "flightNumber must not exceed 20 characters")
        String flightNumber,
        String scheduledDeparture,
        String carrier,
        String origin,
        String destination,
        Integer distanceKm,
        Double airportCongestion,
        Map<String, Object> weatherFeatures,
        String featureSchemaVersion
) {
}