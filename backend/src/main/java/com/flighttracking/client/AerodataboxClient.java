package com.flighttracking.client;

import com.flighttracking.config.AerodataboxProperties;
import com.flighttracking.exception.ExternalApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.TimeUnit;

import com.flighttracking.util.FlightNumberUtils;

@Component
public class AerodataboxClient {

    private static final Logger log = LoggerFactory.getLogger(AerodataboxClient.class);

    private final AerodataboxProperties properties;
    private final RestClient restClient;

    private long nextAllowedRequestNanos = 0L;

    private static final long MIN_REQUEST_INTERVAL_NANOS =
            TimeUnit.MILLISECONDS.toNanos(1100);

    public AerodataboxClient(AerodataboxProperties properties, RestClient aerodataboxRestClient) {
        this.properties = properties;
        this.restClient = aerodataboxRestClient;
    }

    // --- Flight Endpoints ---

    public List<AerodataboxResponse.FlightContract> getFlightByNumber(String flightNumber) {
        String normalized = FlightNumberUtils.normalize(flightNumber);
        LocalDate today = LocalDate.now();
        String todayStr = today.format(DateTimeFormatter.ISO_LOCAL_DATE);

        // Single-day endpoint supports withLocation=true — use it for today to get live position data
        List<AerodataboxResponse.FlightContract> todayFlights = getFlightByNumberOnDate(normalized, todayStr);
        if (!todayFlights.isEmpty()) {
            return todayFlights;
        }

        // Fallback to date-range for flights on other days (yesterday, tomorrow, etc.)
        String dateFrom = today.minusDays(1).format(DateTimeFormatter.ISO_LOCAL_DATE);
        String dateTo = today.plusDays(3).format(DateTimeFormatter.ISO_LOCAL_DATE);
        return getFlightsByDateRange("number", normalized, dateFrom, dateTo);
    }

    public List<AerodataboxResponse.FlightContract> getFlightByNumberOnDate(String flightNumber, String date) {
        String normalized = FlightNumberUtils.normalize(flightNumber);
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(properties.baseUrl())
                .path("/flights/number/{flightNumber}/{date}")
                .queryParam("withLocation", true);

        URI uri = builder.buildAndExpand(normalized, date).encode().toUri();
        AerodataboxResponse.FlightContract[] response = executeGet(uri, AerodataboxResponse.FlightContract[].class);
        return response != null ? List.of(response) : List.of();
    }

    public List<AerodataboxResponse.FlightContract> getFlightsByDateRange(String searchBy, String searchParam,
                                                                           String dateFrom, String dateTo) {
        String normalizedParam = "number".equalsIgnoreCase(searchBy) ? FlightNumberUtils.normalize(searchParam) : searchParam;
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(properties.baseUrl())
                .path("/flights/{searchBy}/{searchParam}/{dateFrom}/{dateTo}");

        URI uri = builder.buildAndExpand(searchBy, normalizedParam, dateFrom, dateTo).encode().toUri();
        AerodataboxResponse.FlightContract[] response = executeGet(uri, AerodataboxResponse.FlightContract[].class);
        return response != null ? List.of(response) : List.of();
    }

    // --- FIDS Endpoints (Airport Departures/Arrivals) ---

    public AerodataboxResponse.AirportFidsContract getAirportFids(String iataCode, String direction) {
        long offsetMinutes = -120;
        long durationMinutes = 720;

        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(properties.baseUrl())
                .path("/flights/airports/iata/{code}")
                .queryParam("offsetMinutes", offsetMinutes)
                .queryParam("durationMinutes", durationMinutes)
                .queryParam("withLeg", true)
                .queryParam("withCancelled", true)
                .queryParam("withCodeshared", false)
                .queryParam("withLocation", true);

        if (direction != null) {
            builder.queryParam("direction", direction);
        }

        URI uri = builder.buildAndExpand(iataCode).encode().toUri();
        return executeGet(uri, AerodataboxResponse.AirportFidsContract.class);
    }

    // --- Airport Endpoint ---

    public AerodataboxResponse.AirportContract getAirportByIata(String iataCode) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(properties.baseUrl())
                .path("/airports/iata/{code}");

        URI uri = builder.buildAndExpand(iataCode).encode().toUri();
        return executeGet(uri, AerodataboxResponse.AirportContract.class);
    }

    // --- Generic Execute ---

    private <T> T executeGet(URI uri, Class<T> responseType) {
        if (properties.apiKey() == null || properties.apiKey().isBlank()) {
            throw new ExternalApiException(
                    "AeroDataBox API key is not configured", 503);
        }

        long waitNanos = nextAllowedRequestNanos - System.nanoTime();

        if (waitNanos > 0) {
            try {
                TimeUnit.NANOSECONDS.sleep(waitNanos);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new ExternalApiException(
                        "Interrupted while waiting for AeroDataBox rate limit", e);
            }
        }

        // Reserve the next request slot before making this request.
        nextAllowedRequestNanos =
                System.nanoTime() + MIN_REQUEST_INTERVAL_NANOS;

        try {
            log.debug("Calling AeroDataBox: {}", uri);

            return restClient.get()
                    .uri(uri)
                    .header("x-api-market-key", properties.apiKey())
                    .retrieve()
                    .body(responseType);

        } catch (Exception e) {
            log.error("AeroDataBox request failed: {} - uri={}",
                    e.getMessage(), uri);

            throw new ExternalApiException(
                    "AeroDataBox API error: " + e.getMessage(), e);
        }
    }
}
