package com.flighttracking.controller;

import com.flighttracking.dto.prediction.DelayPredictionResponse;
import com.flighttracking.service.DelayPredictionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/flights")
public class DelayPredictionController {

    private final DelayPredictionService delayPredictionService;

    public DelayPredictionController(DelayPredictionService delayPredictionService) {
        this.delayPredictionService = delayPredictionService;
    }

    @Operation(summary = "Get flight delay prediction",
            description = "Returns an ML-based estimate of arrival delay and probability of significant delay (>= 15 minutes). Estimates only, not confirmed operational facts.",
            security = @SecurityRequirement(name = "bearerAuth"))
    @GetMapping("/{flightNumber}/delay-prediction")
    public ResponseEntity<DelayPredictionResponse> getDelayPrediction(@PathVariable String flightNumber) {
        DelayPredictionResponse response = delayPredictionService.getDelayPrediction(flightNumber);
        return ResponseEntity.ok(response);
    }
}