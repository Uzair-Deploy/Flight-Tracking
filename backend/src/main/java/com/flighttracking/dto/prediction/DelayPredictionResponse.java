package com.flighttracking.dto.prediction;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record DelayPredictionResponse(
        Double predictedArrivalDelayMinutes,
        Double significantDelayProbability,
        String predictionGeneratedAt,
        String modelVersion,
        String status
) {
}