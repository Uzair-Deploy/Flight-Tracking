// Aligned with backend com.flighttracking.dto.PageResponse
export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

// Backend: com.flighttracking.dto.flight.FlightDto
export interface FlightDto {
  flightNumber: string | null;
  flightIata: string | null;
  flightIcao: string | null;
  airlineName: string | null;
  airlineIata: string | null;
  airlineIcao: string | null;
  departureAirport: string | null;
  departureIata: string | null;
  departureIcao: string | null;
  departureTerminal: string | null;
  departureGate: string | null;
  departureScheduled: string | null;
  departureEstimated: string | null;
  departureActual: string | null;
  departureDelay: string | null;
  arrivalAirport: string | null;
  arrivalIata: string | null;
  arrivalIcao: string | null;
  arrivalTerminal: string | null;
  arrivalGate: string | null;
  arrivalScheduled: string | null;
  arrivalEstimated: string | null;
  arrivalActual: string | null;
  arrivalDelay: string | null;
  status: string | null;
  aircraftRegistration: string | null;
  aircraftIata: string | null;
  aircraftIcao: string | null;
}

export interface FlightSearchResponse {
  flights: FlightDto[];
  count: number;
}

export interface FlightTrackingDto {
  flightNumber: string | null;
  flightIata: string | null;
  flightIcao: string | null;
  flightDate: string | null;
  status: string | null;
  airlineName: string | null;
  airlineIata: string | null;
  airlineIcao: string | null;
  aircraftRegistration: string | null;
  aircraftIata: string | null;
  aircraftIcao: string | null;
  departureAirport: string | null;
  departureIata: string | null;
  departureIcao: string | null;
  departureTerminal: string | null;
  departureGate: string | null;
  departureScheduled: string | null;
  departureEstimated: string | null;
  departureActual: string | null;
  arrivalAirport: string | null;
  arrivalIata: string | null;
  arrivalIcao: string | null;
  arrivalTerminal: string | null;
  arrivalGate: string | null;
  arrivalScheduled: string | null;
  arrivalEstimated: string | null;
  arrivalActual: string | null;
  route: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number | null;
  speedVertical: number | null;
  direction: number | null;
  isGround: boolean | null;
  liveUpdated: string | null;
  departureDelay: string | null;
  arrivalDelay: string | null;
}

// Backend: com.flighttracking.dto.airport.AirportDto
export interface AirportDto {
  iata: string;
  icao: string | null;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  countryIso2: string | null;
}

// Backend: com.flighttracking.dto.weather.WeatherDto
export interface WeatherDto {
  latitude: number;
  longitude: number;
  timezone: string | null;
  temperature: number;
  apparentTemperature: number | null;
  humidity: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  weatherCondition: string | null;
  observationTime: string | null;
}

// Backend: com.flighttracking.dto.airport.AirportExplorerDto
export interface GeoFeature {
  id: string;
  category: string;
  name: string;
  ref: string;
  latitude: number;
  longitude: number;
  geometry: number[][][];
  properties: Record<string, string>;
}

export interface AirportExplorerData {
  iata: string;
  runways: GeoFeature[];
  taxiways: GeoFeature[];
  terminals: GeoFeature[];
  buildings: GeoFeature[];
  gates: GeoFeature[];
  parking: GeoFeature[];
  transport: GeoFeature[];
  amenities: GeoFeature[];
}

// Backend: com.flighttracking.dto.booking.BookingResponse
export interface BookingResponse {
  id: number;
  userId: number;
  username: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureScheduled: string | null;
  arrivalScheduled: string | null;
  airlineName: string | null;
  aircraftRegistration: string | null;
  status: string;
  createdAt: string;
  ignavId: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  priceStatus: string | null;
  providerName: string | null;
  providerType: string | null;
  bookingUrl: string | null;
  cabin: string | null;
  duration: string | null;
  stops: number | null;
}

export interface BookingRequest {
  flightNumber: string;
  origin: string;
  destination: string;
  departureScheduled?: string | null;
  arrivalScheduled?: string | null;
  airlineName?: string | null;
  aircraftRegistration?: string | null;
  ignavId?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  priceStatus?: string | null;
  providerName?: string | null;
  providerType?: string | null;
  bookingUrl?: string | null;
  cabin?: string | null;
  duration?: string | null;
  stops?: number | null;
  ignavLegsJson?: string | null;
}

// ── Ignav types ──────────────────────────────────────────────

export interface IgnavSearchRequest {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string | null;
  adults?: number;
  cabin?: string | null;
  maxStops?: number | null;
  market?: string | null;
  tripType?: string | null;
}

export interface IgnavLegDto {
  origin: string | null;
  destination: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  airline: string | null;
  flightNumber: string | null;
  aircraft: string | null;
  duration: string | null;
}

export interface IgnavSegmentDto {
  origin: string | null;
  destination: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  departureTimeUtc: string | null;
  arrivalTimeUtc: string | null;
  duration: string | null;
  marketingCarrierCode: string | null;
  flightNumber: string | null;
  operatingCarrierName: string | null;
  aircraft: string | null;
}

export interface IgnavItineraryDto {
  ignavId: string;
  airline: string | null;
  airlineCode: string | null;
  flightNumber: string | null;
  origin: string | null;
  destination: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  duration: string | null;
  stops: number | null;
  aircraft: string | null;
  cabin: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  priceStatus: string | null;
  requiresSelfTransfer: boolean | null;
  bags: string | null;
  legs: IgnavLegDto[];
  segments: IgnavSegmentDto[];
}

export interface IgnavSearchResponse {
  itineraries: IgnavItineraryDto[];
  count: number;
  requestId: string | null;
}

export interface IgnavBookingLinksRequest {
  ignavId: string;
}

export interface IgnavProviderLink {
  providerName: string | null;
  providerType: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  priceStatus: string | null;
  url: string | null;
}

export interface IgnavBookingOption {
  legIndexes: number[];
  links: IgnavProviderLink[];
}

export interface IgnavBookingLinksResponse {
  ignavId: string;
  bookingOptions: IgnavBookingOption[];
}

export interface HealthResponse {
  status: string;
  application: string;
  timestamp: string;
}

export interface MessageResponse {
  message: string;
}

// Backend: com.flighttracking.dto.telemetry.TelemetryResponse
export interface TelemetryResponse {
  id: number;
  flightNumber: string;
  flightIata: string | null;
  flightIcao: string | null;
  airlineIata: string | null;
  originIata: string | null;
  destinationIata: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number | null;
  direction: number | null;
  heading: number | null;
  flightStatus: string | null;
  routeInfo: string | null;
  aircraftRegistration: string | null;
  recordedAt: string | null;
  createdAt: string;
}

export interface TelemetryRequest {
  flightNumber: string;
  flightIata?: string | null;
  flightIcao?: string | null;
  airlineIata?: string | null;
  originIata?: string | null;
  destinationIata?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  speed?: number | null;
  direction?: number | null;
  heading?: number | null;
  flightStatus?: string | null;
  routeInfo?: string | null;
  aircraftRegistration?: string | null;
}

// Backend: com.flighttracking.dto.anomaly.AnomalyResponse
export interface AnomalyResponse {
  id: number;
  flightNumber: string;
  flightIata: string | null;
  anomalyType: string;
  severity: string; // LOW | MEDIUM | HIGH | CRITICAL
  description: string | null;
  status: string; // OPEN | INVESTIGATING | RESOLVED | FALSE_POSITIVE
  telemetryId: number | null;
  detectedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnomalyRequest {
  flightNumber: string;
  flightIata?: string | null;
  anomalyType: string; // ^[A-Za-z0-9_\-]+$
  severity: string; // LOW|MEDIUM|HIGH|CRITICAL
  description?: string | null;
  status?: string | null; // OPEN|INVESTIGATING|RESOLVED|FALSE_POSITIVE
  telemetryId?: number | null;
}

// Backend: com.flighttracking.ai.dto.AtcExplanationResponse
export interface AtcExplanationResponse {
  explanation: string;
  anomalyId: number;
  flightNumber: string | null;
  facts: string[];
  context: string[];
  limitations: string[];
}

// Backend: com.flighttracking.dto.prediction.DelayPredictionResponse
export interface DelayPredictionResponse {
  predictedArrivalDelayMinutes: number | null;
  significantDelayProbability: number | null;
  predictionGeneratedAt: string | null;
  modelVersion: string | null;
  status: string; // AVAILABLE | UNAVAILABLE
}
