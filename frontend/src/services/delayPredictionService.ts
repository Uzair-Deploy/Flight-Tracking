import { Api } from "@/services/api";
import type { DelayPredictionResponse } from "@/types/api";

export const delayPredictionService = {
  getDelayPrediction(flightNumber: string) {
    return Api.get<DelayPredictionResponse>(
      `/api/flights/${encodeURIComponent(flightNumber)}/delay-prediction`
    );
  },
};