import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { flightService, type FlightSearchParams } from "@/services/flight.service";
import { airportService } from "@/services/airport.service";
import { weatherService } from "@/services/weather.service";
import { delayPredictionService } from "@/services/delayPredictionService";
import { ApiError } from "@/services/api";
import type { FlightDto, FlightTrackingDto, WeatherDto, DelayPredictionResponse } from "@/types/api";
import { TrackingMap } from "@/components/tracking/TrackingMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Loader2,
  Plane,
  Navigation,
  Thermometer,
  Wind,
  Target,
  MapPin,
  Clock,
  BadgeInfo,
  Gauge,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Building2,
  Ticket,
  Route as RouteIcon,
  Activity,
  X,
} from "lucide-react";

/* helpers */
function formatStatus(status: string | null) {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
function statusPillClasses(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s === "en-route" || s === "en route")
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.25)]";
  if (s === "landed" || s === "arrived") return "bg-sky-500/15 text-sky-400 border-sky-500/30";
  if (s === "cancelled" || s === "incident" || s === "diverted") return "bg-red-500/15 text-red-400 border-red-500/30";
  if (s === "scheduled") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-white/5 text-muted-foreground border-white/10";
}
function formatTimestamp(v: string | null | undefined): string {
  if (!v) return "—";
  // try ISO first
  const asNumber = Number(v);
  // if it's purely numeric epoch
  if (!isNaN(asNumber) && /^\d{8,16}$/.test(String(v).trim())) {
    let ms = asNumber;
    // epoch seconds (10 digits) vs ms (13)
    if (String(Math.trunc(asNumber)).length === 10) ms = asNumber * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  }
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    // valid ISO
    // If string was already epoch-like but parsed as date incorrectly, above handles
    return d.toLocaleString();
  }
  return String(v);
}
function formatFlightDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  // numeric fallback
  const n = Number(v);
  if (!isNaN(n) && /^\d{9,13}$/.test(v.trim())) {
    let ms = n;
    if (String(Math.trunc(n)).length === 10) ms = n * 1000;
    const dn = new Date(ms);
    if (!isNaN(dn.getTime())) return dn.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  return String(v);
}
function isAirborne(tracking: FlightTrackingDto | null, flight: FlightDto | null): boolean {
  if (tracking?.isGround === true) return false;
  if (tracking?.isGround === false) return true;
  const s = (tracking?.status ?? flight?.status ?? "").toLowerCase();
  if (s === "active" || s === "en-route" || s === "en route") return true;
  if (s === "landed" || s === "arrived" || s === "cancelled") return false;
  // if altitude + speed present assume airborne
  if (tracking?.altitude != null && tracking.altitude > 1000) return true;
  return false;
}

export function TrackingPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Request guards to prevent race conditions
  const initialSearchStartedRef = useRef(false);
  const selectionRequestIdRef = useRef(0);
  const inFlightSelectionRef = useRef<string | null>(null);

  const [flightIata, setFlightIata] = useState(searchParams.get("flight_iata") ?? "");
  const [depIata, setDepIata] = useState(searchParams.get("dep_iata") ?? "");
  const [arrIata, setArrIata] = useState(searchParams.get("arr_iata") ?? "");
  const [airlineIata, setAirlineIata] = useState(searchParams.get("airline_iata") ?? "");
  const [flightStatus, setFlightStatus] = useState(searchParams.get("flight_status") ?? "");
  const [limit, setLimit] = useState(searchParams.get("limit") ?? "10");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [results, setResults] = useState<FlightDto[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<FlightDto | null>(null);
  const [detail, setDetail] = useState<FlightDto | null>(null);
  const [tracking, setTracking] = useState<FlightTrackingDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [depCoords, setDepCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [arrCoords, setArrCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [weather, setWeather] = useState<WeatherDto | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [delayPrediction, setDelayPrediction] = useState<DelayPredictionResponse | null>(null);
  const [loadingDelayPrediction, setLoadingDelayPrediction] = useState(false);
  const [delayPredictionError, setDelayPredictionError] = useState<string | null>(null);

  const buildParams = (): FlightSearchParams => {
    const p: FlightSearchParams = {};
    if (flightIata.trim()) p.flight_iata = flightIata.trim();
    if (depIata.trim()) p.dep_iata = depIata.trim().toUpperCase();
    if (arrIata.trim()) p.arr_iata = arrIata.trim().toUpperCase();
    if (airlineIata.trim()) p.airline_iata = airlineIata.trim().toUpperCase();
    if (flightStatus && flightStatus !== "all") p.flight_status = flightStatus;
    const l = parseInt(limit, 10);
    if (!isNaN(l)) p.limit = l;
    return p;
  };

  const doSearch = async (params?: FlightSearchParams) => {
    const p = params ?? buildParams();
    if (!p.flight_iata && !p.dep_iata && !p.arr_iata && !p.airline_iata && !p.flight_status) {
      setSearchError("Enter at least one search filter — flight, departure, arrival, airline or status.");
      return;
    }
    if (p.flight_status && !p.flight_iata && !p.dep_iata && !p.arr_iata && !p.airline_iata) {
      setSearchError("Status filter requires an airport or flight filter to narrow the search.");
      return;
    }
    if (p.dep_iata && !/^[A-Za-z]{3}$/.test(p.dep_iata)) {
      setSearchError("Departure must be a 3-letter IATA code.");
      return;
    }
    if (p.arr_iata && !/^[A-Za-z]{3}$/.test(p.arr_iata)) {
      setSearchError("Arrival must be a 3-letter IATA code.");
      return;
    }
    setLoadingSearch(true);
    setSearchError(null);
    setResults(null);
    setCount(null);
    try {
      const res = await flightService.search(p);
      setResults(res.flights);
      setCount(res.count);
      const sp = new URLSearchParams();
      if (p.flight_iata) sp.set("flight_iata", p.flight_iata);
      if (p.dep_iata) sp.set("dep_iata", p.dep_iata);
      if (p.arr_iata) sp.set("arr_iata", p.arr_iata);
      if (p.airline_iata) sp.set("airline_iata", p.airline_iata);
      if (p.flight_status && p.flight_status !== "all") sp.set("flight_status", p.flight_status);
      if (p.limit) sp.set("limit", String(p.limit));
      setSearchParams(sp, { replace: true });
      if (res.flights.length > 0) {
        handleSelect(res.flights[0]);
      } else {
        setSelected(null);
        setDetail(null);
        setTracking(null);
      }
    } catch (e) {
      if (e instanceof ApiError) setSearchError(e.message);
      else setSearchError("Search failed. Please try again.");
    } finally {
      setLoadingSearch(false);
    }
  };

  useEffect(() => {
    const q = searchParams.get("flight_iata");
    const dep = searchParams.get("dep_iata");
    const arr = searchParams.get("arr_iata");
    const air = searchParams.get("airline_iata");
    const st = searchParams.get("flight_status");
    const lim = searchParams.get("limit");
    if (lim) setLimit(lim);
    if (st) setFlightStatus(st);
    if (air) setAirlineIata(air);
    if (dep) setDepIata(dep);
    if (arr) setArrIata(arr);
    if (
  (q || dep || arr || air || st) &&
  !results &&
  !loadingSearch &&
  !initialSearchStartedRef.current
) {
  initialSearchStartedRef.current = true;
      if (q) setFlightIata(q);
      const p: FlightSearchParams = {};
      if (q) p.flight_iata = q;
      if (dep) p.dep_iata = dep;
      if (arr) p.arr_iata = arr;
      if (air) p.airline_iata = air;
      if (st) p.flight_status = st;
      if (lim) p.limit = parseInt(lim, 10) || 10;
      else p.limit = parseInt(limit, 10) || 10;
      // avoid calling buildParams which reads stale state
      if (Object.keys(p).length > 0) doSearch(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = async (f: FlightDto) => {
    const flightNumber = f.flightIata ?? f.flightNumber ?? "";

    if (!flightNumber) {
      selectionRequestIdRef.current += 1;
      inFlightSelectionRef.current = null;
      setSelected(f);
      setDetail(null);
      setTracking(null);
      setDetailError("No flight number available for details.");
      setLoadingDetail(false);
      return;
    }

    const selectionKey = flightNumber.replace(/\s+/g, "").toUpperCase();

    if (inFlightSelectionRef.current === selectionKey) return;

    const requestId = ++selectionRequestIdRef.current;
    inFlightSelectionRef.current = selectionKey;
    const isCurrentSelection = () =>
      requestId === selectionRequestIdRef.current;

    setSelected(f);
    setDetail(null);
    setTracking(null);
    setDetailError(null);
    setLoadingDetail(true);
    setDepCoords(null);
    setArrCoords(null);
    setWeather(null);
    setWeatherError(null);
    setLoadingWeather(false);

    // Reset delay prediction state
    setDelayPrediction(null);
    setDelayPredictionError(null);
    setLoadingDelayPrediction(true);

    // Fetch delay prediction (non-blocking)
    delayPredictionService
      .getDelayPrediction(flightNumber)
      .then((pred) => {
        if (!isCurrentSelection()) return;
        if (pred && pred.status === "AVAILABLE") {
          setDelayPrediction(pred);
        } else {
          setDelayPredictionError("Prediction unavailable for this flight.");
        }
      })
      .catch(() => {
        if (!isCurrentSelection()) return;
        setDelayPredictionError("Delay prediction service temporarily unavailable.");
      })
      .finally(() => {
        if (!isCurrentSelection()) return;
        setLoadingDelayPrediction(false);
      });

    try {
      const t = await flightService
        .getTracking(flightNumber)
        .catch(() => null);

      const resolvedDetail = f;

      if (!isCurrentSelection()) return;

      setDetail(resolvedDetail);
      if (t) {
        setTracking(t);
        if (t.latitude != null && t.longitude != null) {
          setLoadingWeather(true);
          setWeatherError(null);
          weatherService
            .getByCoordinates(t.latitude, t.longitude)
            .then((w) => {
              if (!isCurrentSelection()) return;
              setWeather(w);
            })
            .catch(() => {
              if (!isCurrentSelection()) return;
              setWeatherError("Weather data temporarily unavailable");
            })
            .finally(() => {
              if (!isCurrentSelection()) return;
              setLoadingWeather(false);
            });
        }
      } else {
        setTracking(null);
      }
      // airport coords for route visualization
      const depIataVal = (t?.departureIata ?? resolvedDetail.departureIata) ?? null;
      const arrIataVal = (t?.arrivalIata ?? resolvedDetail.arrivalIata) ?? null;
      const tasks: Promise<void>[] = [];
      if (depIataVal && /^[A-Za-z]{3}$/.test(depIataVal)) {
        tasks.push(
          airportService
            .getByIata(depIataVal)
            .then((a) => {
              if (!isCurrentSelection()) return;
              if (a.latitude != null && a.longitude != null) setDepCoords({ lat: a.latitude, lng: a.longitude });
            })
            .catch(() => {})
        );
      }
      if (arrIataVal && /^[A-Za-z]{3}$/.test(arrIataVal)) {
        tasks.push(
          airportService
            .getByIata(arrIataVal)
            .then((a) => {
              if (!isCurrentSelection()) return;
              if (a.latitude != null && a.longitude != null) setArrCoords({ lat: a.latitude, lng: a.longitude });
            })
            .catch(() => {})
        );
      }
      await Promise.all(tasks);
    } catch (e) {
      if (e instanceof ApiError) setDetailError(e.message);
      else setDetailError("Failed to load flight details.");
    } finally {
      if (isCurrentSelection()) {
        setLoadingDetail(false);

        if (inFlightSelectionRef.current === selectionKey) {
          inFlightSelectionRef.current = null;
        }
      }
    }
  };

  const handleClear = () => {
    setFlightIata("");
    setDepIata("");
    setArrIata("");
    setAirlineIata("");
    setFlightStatus("");
    setLimit("10");
    setResults(null);
    setCount(null);
    setSearchError(null);
    setDetailError(null);
    setShowAdvanced(false);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const displayFlight = detail ?? selected;
  const airborne = isAirborne(tracking, displayFlight ?? null);

  const livePoint =
    tracking?.latitude != null && tracking?.longitude != null
      ? { lat: tracking.latitude, lng: tracking.longitude, label: tracking.flightIata ?? tracking.flightNumber ?? displayFlight?.flightIata ?? "Aircraft" }
      : null;

  const depPoint =
    depCoords && displayFlight
      ? { lat: depCoords.lat, lng: depCoords.lng, label: displayFlight.departureIata ?? "Departure", subLabel: displayFlight.departureAirport ?? undefined }
      : null;
  const arrPoint =
    arrCoords && displayFlight
      ? { lat: arrCoords.lat, lng: arrCoords.lng, label: displayFlight.arrivalIata ?? "Arrival", subLabel: displayFlight.arrivalAirport ?? undefined }
      : null;

  return (
    <div className="w-full flex-1 flex flex-col lg:flex-row min-h-[100dvh] pt-20 bg-background overflow-hidden">
      {/* LEFT 60% */}
      <div className="w-full lg:w-[60%] flex flex-col h-auto lg:h-[calc(100dvh-80px)] lg:overflow-hidden border-r border-white/5 relative bg-background">
        {/* Search – compact glass panel */}
        <div className="shrink-0 p-3 lg:p-4 border-b border-white/5 bg-background/80 backdrop-blur">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded bg-primary/15 border border-primary/20 flex items-center justify-center">
                <Search className="size-3.5 text-primary" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-primary">Search Flights</p>
                <p className="text-[11px] text-muted-foreground -mt-0.5">Live directory • AeroDataBox</p>
              </div>
            </div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="hidden lg:flex items-center gap-1 text-[11px] uppercase tracking-widest font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              Advanced
            </button>
          </div>

          {/* Primary row – consistent h-8 baseline */}
          <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 items-end">
            <div className="lg:col-span-3 space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Flight</Label>
              <div className="relative">
                <Ticket className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="LH400"
                  value={flightIata}
                  onChange={(e) => setFlightIata(e.target.value)}
                  className="pl-8 bg-white/[0.04] border-white/10 font-mono text-sm uppercase h-8 focus-visible:border-primary/40"
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                />
              </div>
            </div>
            <div className="lg:col-span-2 space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Departure</Label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="DEL"
                  maxLength={3}
                  value={depIata}
                  onChange={(e) => setDepIata(e.target.value.toUpperCase())}
                  className="pl-8 bg-white/[0.04] border-white/10 font-mono text-sm uppercase h-8"
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                />
              </div>
            </div>
            <div className="lg:col-span-2 space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Arrival</Label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="BOM"
                  maxLength={3}
                  value={arrIata}
                  onChange={(e) => setArrIata(e.target.value.toUpperCase())}
                  className="pl-8 bg-white/[0.04] border-white/10 font-mono text-sm uppercase h-8"
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                />
              </div>
            </div>
            <div className="lg:col-span-2 space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Airline</Label>
              <Input
                placeholder="LH"
                value={airlineIata}
                onChange={(e) => setAirlineIata(e.target.value.toUpperCase())}
                className="bg-white/[0.04] border-white/10 font-mono text-sm uppercase h-8"
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
              />
            </div>
            <div className="lg:col-span-3 space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</Label>
              <Select value={flightStatus || "all"} onValueChange={(v) => setFlightStatus((v as string) === "all" ? "" : (v as string) ?? "")}>
                <SelectTrigger className="h-8 bg-white/[0.04] border-white/10 font-mono text-sm">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="landed">Landed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="incident">Incident</SelectItem>
                  <SelectItem value="diverted">Diverted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* actions row – aligned baseline */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <div className="flex items-center gap-2">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Limit</Label>
              <Select value={limit} onValueChange={(v) => setLimit((v as string) ?? "10")}>
                <SelectTrigger className="w-[86px] h-8 bg-white/[0.04] border-white/10 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => doSearch()} disabled={loadingSearch} className="h-8 px-5 text-xs uppercase tracking-widest font-semibold">
              {loadingSearch ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
              Search
            </Button>
            <Button variant="outline" size="sm" onClick={handleClear} className="h-8 text-xs border-white/10 hover:border-white/20 bg-white/[0.03]">
              <X className="size-3" /> Clear
            </Button>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="lg:hidden flex items-center gap-1 text-[11px] uppercase tracking-widest font-mono text-muted-foreground hover:text-foreground ml-auto"
            >
              {showAdvanced ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              Advanced
            </button>
            {count != null && results && (
              <span className="ml-auto text-[11px] font-mono text-muted-foreground">
                {count} result{count === 1 ? "" : "s"} • {results.length} shown
              </span>
            )}
          </div>

          {showAdvanced && (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 flex items-start gap-2">
              <BadgeInfo className="size-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Filters combine with AND. Use specific IATA codes for precise results. Status alone requires another filter.
              </p>
            </div>
          )}

          {searchError && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 flex items-start gap-2">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive leading-relaxed">{searchError}</p>
            </div>
          )}
        </div>

        {/* scrollable content – tighter density */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 lg:p-4 space-y-4 lg:pb-6">
          {/* awaiting */}
          {!displayFlight && !loadingDetail && !loadingSearch && !results && !searchError && (
            <div className="h-[240px] flex flex-col items-center justify-center text-center space-y-3 opacity-60 glass-panel rounded-xl border-dashed">
              <div className="size-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <Target className="size-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-white">Awaiting Input</p>
                <p className="text-xs text-muted-foreground max-w-[32ch]">Enter a flight identifier or route to acquire live telemetry.</p>
              </div>
            </div>
          )}

          {/* loading detail */}
          {loadingDetail && (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="font-mono text-xs uppercase tracking-widest">Acquiring telemetry…</span>
            </div>
          )}

          {/* Selected flight */}
          {displayFlight && !loadingDetail && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-4">
              {/* Identity header – tighter */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-primary">
                      {displayFlight.airlineName ?? displayFlight.airlineIata ?? "Aviation"}
                    </p>
                    {airborne ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Airborne
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest bg-white/5 border-white/10 text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-muted-foreground" /> {formatStatus(displayFlight.status)}
                      </span>
                    )}
                  </div>
                  <h1 className="text-3xl lg:text-4xl font-semibold tracking-tighter text-white font-mono uppercase leading-none">
                    {displayFlight.flightIata ?? displayFlight.flightNumber ?? "—"}
                  </h1>
                  <p className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
                    <Plane className="size-3" />
                    {displayFlight.aircraftRegistration ?? displayFlight.aircraftIata ?? "Unknown Equipment"}
                    {displayFlight.aircraftIcao ? ` • ${displayFlight.aircraftIcao}` : ""}
                  </p>
                </div>
                <div className={`shrink-0 px-2.5 py-1 rounded-full border text-[10px] uppercase font-bold tracking-widest font-mono ${statusPillClasses(displayFlight.status ?? tracking?.status ?? null)}`}>
                  {formatStatus(displayFlight.status ?? tracking?.status ?? null)}
                </div>
              </div>

              {/* Route card – compact */}
              <div className="glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <RouteIcon className="size-3.5 text-primary" />
                  <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">Route</span>
                  {tracking?.route && <span className="text-[11px] font-mono text-white/60">• {tracking.route}</span>}
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Departure</p>
                    <p className="text-2xl lg:text-3xl font-mono text-white leading-none">{displayFlight.departureIata ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{displayFlight.departureAirport ?? "—"}</p>
                    <p className="font-mono text-[11px] text-white/70">{displayFlight.departureScheduled ? formatTimestamp(displayFlight.departureScheduled) : "—"}</p>
                    {(displayFlight.departureTerminal || displayFlight.departureGate) && (
                      <p className="text-[11px] font-mono text-muted-foreground">T {displayFlight.departureTerminal ?? "—"} • G {displayFlight.departureGate ?? "—"}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1.5 px-2">
                    <div className="h-px w-10 lg:w-12 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <div className="size-7 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shadow-[0_0_12px_rgba(56,189,248,0.3)]">
                      <Plane className="size-3.5 text-primary rotate-90" />
                    </div>
                    <div className="h-px w-10 lg:w-12 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {displayFlight.departureIata && displayFlight.arrivalIata ? `${displayFlight.departureIata} → ${displayFlight.arrivalIata}` : "—"}
                    </span>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Arrival</p>
                    <p className="text-2xl lg:text-3xl font-mono text-white leading-none">{displayFlight.arrivalIata ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{displayFlight.arrivalAirport ?? "—"}</p>
                    <p className="font-mono text-[11px] text-white/70">{displayFlight.arrivalScheduled ? formatTimestamp(displayFlight.arrivalScheduled) : "—"}</p>
                    {(displayFlight.arrivalTerminal || displayFlight.arrivalGate) && (
                      <p className="text-[11px] font-mono text-muted-foreground">T {displayFlight.arrivalTerminal ?? "—"} • G {displayFlight.arrivalGate ?? "—"}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Flight details tabs – compact */}
              <div className="glass-panel rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <Clock className="size-3.5 text-primary" />
                  <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">Flight Details</span>
                </div>
                <Tabs defaultValue="flight" className="w-full">
                  <TabsList className="w-full bg-white/[0.04] border border-white/5 p-1 h-7">
                    <TabsTrigger value="flight" className="flex-1 text-xs data-[state=active]:bg-white data-[state=active]:text-black">Flight</TabsTrigger>
                    <TabsTrigger value="schedule" className="flex-1 text-xs data-[state=active]:bg-white data-[state=active]:text-black">Schedule</TabsTrigger>
                    <TabsTrigger value="aircraft" className="flex-1 text-xs data-[state=active]:bg-white data-[state=active]:text-black">Aircraft</TabsTrigger>
                  </TabsList>
                  <TabsContent value="flight" className="space-y-0 pt-3">
                    <DetailRow label="Flight" value={displayFlight.flightIata ?? displayFlight.flightNumber} mono />
                    <DetailRow label="Number" value={displayFlight.flightNumber} mono />
                    <DetailRow label="ICAO" value={displayFlight.flightIcao} mono />
                    <DetailRow label="Airline" value={displayFlight.airlineName ? `${displayFlight.airlineName} ${displayFlight.airlineIata ? `(${displayFlight.airlineIata})` : ""}` : displayFlight.airlineIata} />
                    <DetailRow label="Airline ICAO" value={displayFlight.airlineIcao} mono />
                    <DetailRow label="Status" value={<span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-mono uppercase tracking-widest ${statusPillClasses(displayFlight.status)}`}>{formatStatus(displayFlight.status)}</span>} />
                  </TabsContent>
                  <TabsContent value="schedule" className="space-y-3 pt-3">
                    <div className="space-y-0">
                      <p className="text-[11px] uppercase tracking-widest font-semibold text-primary flex items-center gap-1.5 mb-1.5"><MapPin className="size-3" /> Departure</p>
                      <DetailRow label="Airport" value={displayFlight.departureAirport} />
                      <DetailRow label="IATA" value={displayFlight.departureIata} mono />
                      <DetailRow label="ICAO" value={displayFlight.departureIcao} mono />
                      <DetailRow label="Terminal / Gate" value={`${displayFlight.departureTerminal ?? "—"} / ${displayFlight.departureGate ?? "—"}`} mono />
                      <DetailRow label="Scheduled" value={displayFlight.departureScheduled ? formatTimestamp(displayFlight.departureScheduled) : null} mono />
                      <DetailRow label="Estimated" value={displayFlight.departureEstimated ? formatTimestamp(displayFlight.departureEstimated) : null} mono />
                      <DetailRow label="Actual" value={displayFlight.departureActual ? formatTimestamp(displayFlight.departureActual) : null} mono />
                      <DetailRow label="Delay" value={displayFlight.departureDelay} mono />
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="space-y-0">
                      <p className="text-[11px] uppercase tracking-widest font-semibold text-primary flex items-center gap-1.5 mb-1.5"><MapPin className="size-3" /> Arrival</p>
                      <DetailRow label="Airport" value={displayFlight.arrivalAirport} />
                      <DetailRow label="IATA" value={displayFlight.arrivalIata} mono />
                      <DetailRow label="ICAO" value={displayFlight.arrivalIcao} mono />
                      <DetailRow label="Terminal / Gate" value={`${displayFlight.arrivalTerminal ?? "—"} / ${displayFlight.arrivalGate ?? "—"}`} mono />
                      <DetailRow label="Scheduled" value={displayFlight.arrivalScheduled ? formatTimestamp(displayFlight.arrivalScheduled) : null} mono />
                      <DetailRow label="Estimated" value={displayFlight.arrivalEstimated ? formatTimestamp(displayFlight.arrivalEstimated) : null} mono />
                      <DetailRow label="Actual" value={displayFlight.arrivalActual ? formatTimestamp(displayFlight.arrivalActual) : null} mono />
                      <DetailRow label="Delay" value={displayFlight.arrivalDelay} mono />
                    </div>
                  </TabsContent>
                  <TabsContent value="aircraft" className="space-y-0 pt-3">
                    <DetailRow label="Registration" value={displayFlight.aircraftRegistration} mono />
                    <DetailRow label="IATA" value={displayFlight.aircraftIata} mono />
                    <DetailRow label="ICAO" value={displayFlight.aircraftIcao} mono />
                  </TabsContent>
                </Tabs>
                {detailError && (
                  <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 flex gap-2">
                    <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                    <span className="text-xs text-destructive">{detailError}</span>
                  </div>
                )}
              </div>

              {/* Live Telemetry – compact */}
              <div className="glass-panel rounded-xl p-3.5">
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-3">
                  <h3 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground flex items-center gap-2">
                    <Activity className="size-3.5 text-primary" /> Live Tracking
                  </h3>
                  {tracking?.isGround != null && (
                    <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${tracking.isGround ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"}`}>
                      {tracking.isGround ? "Ground" : "Airborne"}
                    </span>
                  )}
                </div>
                {!tracking ? (
                  <div className="flex items-center gap-2 py-5 justify-center text-muted-foreground">
                    <Gauge className="size-4" />
                    <span className="text-xs font-mono">No live telemetry available for this flight.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                      <DataBlock label="Altitude" value={tracking.altitude != null ? `${tracking.altitude}` : null} unit="m" />
                      <DataBlock label="Speed" value={tracking.speed != null ? `${tracking.speed}` : null} unit="km/h" />
                      <DataBlock label="Heading" value={tracking.direction != null ? `${Number(tracking.direction).toFixed(1)}` : null} unit="°" />
                      <DataBlock label="Vertical" value={tracking.speedVertical != null ? `${tracking.speedVertical}` : null} unit="m/s" />
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 sm:gap-x-10 gap-y-0 text-xs">
                      <LiveRow label="Flight date" value={tracking.flightDate ? formatFlightDate(tracking.flightDate) : "—"} />
                      <LiveRow label="Status" value={tracking.status ? formatStatus(tracking.status) : "—"} />
                      <LiveRow label="Route" value={tracking.route ?? "—"} mono />
                      <LiveRow label="Latitude" value={tracking.latitude != null ? tracking.latitude.toString() : "—"} mono />
                      <LiveRow label="Longitude" value={tracking.longitude != null ? tracking.longitude.toString() : "—"} mono />
                      <LiveRow label="Direction" value={tracking.direction != null ? `${Number(tracking.direction).toFixed(1)}°` : "—"} mono />
                      <LiveRow label="Is ground" value={tracking.isGround != null ? (tracking.isGround ? "Ground" : "Airborne") : "—"} />
                      <LiveRow label="Live updated" value={tracking.liveUpdated ? formatTimestamp(tracking.liveUpdated) : "—"} mono />
                      <LiveRow label="Departure delay" value={tracking.departureDelay ?? "—"} mono />
                      <LiveRow label="Arrival delay" value={tracking.arrivalDelay ?? "—"} mono />
                    </div>
                  </div>
                )}
              </div>

              {/* Weather – compact */}
              <div className="glass-panel rounded-xl p-3.5">
                <h3 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground flex items-center gap-2 border-b border-white/5 pb-2.5 mb-3">
                  <Thermometer className="size-3.5 text-primary" /> Current Weather
                </h3>
                {!tracking || tracking.latitude == null || tracking.longitude == null ? (
                  <p className="text-xs text-muted-foreground font-mono py-3 text-center">Select a flight with live position to load weather.</p>
                ) : (
                  <>
                    {loadingWeather && (
                      <div className="flex items-center justify-center py-6 gap-2">
                        <Loader2 className="size-4 animate-spin text-primary" />
                        <span className="text-xs font-mono text-muted-foreground">Loading conditions…</span>
                      </div>
                    )}
                    {!loadingWeather && weatherError && (
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-5 text-center">
                        <p className="text-xs text-muted-foreground">Weather data temporarily unavailable</p>
                      </div>
                    )}
                    {!loadingWeather && weather && !weatherError && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-1">
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                            <Thermometer className="size-3" /> Temperature
                          </div>
                          <div className="text-base font-mono font-semibold text-white">{weather.temperature}°C</div>
                          <div className="text-[11px] text-muted-foreground">{weather.weatherCondition ?? "—"} • Feels {weather.apparentTemperature ?? "—"}°C</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-1">
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                            <Wind className="size-3" /> Wind
                          </div>
                          <div className="text-base font-mono font-semibold text-white">{weather.windSpeed ?? "—"} km/h</div>
                          <div className="text-[11px] text-muted-foreground">Humidity {weather.humidity ?? "—"}%</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-1">
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Precipitation</div>
                          <div className="text-base font-mono font-semibold text-white">{weather.precipitation ?? "—"} mm</div>
                          <div className="text-[11px] text-muted-foreground truncate">{weather.timezone ?? ""}</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-1">
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Observation</div>
                          <div className="text-xs font-mono text-white">{weather.observationTime ? formatTimestamp(weather.observationTime) : "—"}</div>
                          <div className="text-[11px] text-muted-foreground">Code {weather.weatherCode ?? "—"}</div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Delay Prediction – compact */}
              <div className="glass-panel rounded-xl p-3.5">
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-3">
                  <h3 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground flex items-center gap-2">
                    <Gauge className="size-3.5 text-primary" /> Delay Prediction
                  </h3>
                  {delayPrediction && (
                    <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                      delayPrediction.status === "AVAILABLE"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    }`}>
                      {delayPrediction.status}
                    </span>
                  )}
                </div>
                {loadingDelayPrediction && (
                  <div className="flex items-center justify-center py-6 gap-2">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <span className="text-xs font-mono text-muted-foreground">Generating prediction…</span>
                  </div>
                )}
                {!loadingDelayPrediction && delayPredictionError && (
                  <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-5 text-center">
                    <p className="text-xs text-muted-foreground">{delayPredictionError}</p>
                  </div>
                )}
                {!loadingDelayPrediction && delayPrediction && delayPrediction.status === "AVAILABLE" && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-1">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                        <Clock className="size-3" /> Est. Arrival Delay
                      </div>
                      <div className="text-xl font-mono font-semibold text-white">
                        {delayPrediction.predictedArrivalDelayMinutes != null
                          ? `${delayPrediction.predictedArrivalDelayMinutes.toFixed(1)} min`
                          : "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">Estimate only — not confirmed</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-1">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="size-3" /> Significant Delay Risk
                      </div>
                      <div className="text-xl font-mono font-semibold text-white">
                        {delayPrediction.significantDelayProbability != null
                          ? `${(delayPrediction.significantDelayProbability * 100).toFixed(0)}%`
                          : "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">Probability delay ≥ 15 min</div>
                    </div>
                  </div>
                )}
                {!loadingDelayPrediction && delayPrediction && delayPrediction.status !== "AVAILABLE" && (
                  <p className="text-xs text-muted-foreground font-mono py-3 text-center">
                    Prediction unavailable for this flight.
                  </p>
                )}
                {!loadingDelayPrediction && !delayPrediction && !delayPredictionError && (
                  <p className="text-xs text-muted-foreground font-mono py-3 text-center">
                    Select a flight to load delay prediction.
                  </p>
                )}
                {delayPrediction && delayPrediction.status === "AVAILABLE" && (
                  <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="text-muted-foreground">Generated</div>
                    <div className="font-mono text-white text-right">
                      {delayPrediction.predictionGeneratedAt
                        ? new Date(delayPrediction.predictionGeneratedAt).toLocaleString()
                        : "—"}
                    </div>
                    <div className="text-muted-foreground">Model</div>
                    <div className="font-mono text-white text-right">
                      {delayPrediction.modelVersion ?? "—"}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Results – compact */}
          <div className="glass-panel rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Navigation className="size-3.5 text-primary" />
                <h3 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">Results</h3>
                {count != null && <span className="text-[11px] font-mono text-muted-foreground">({count})</span>}
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-muted-foreground">
                {results ? `${results.length} shown` : "—"}
              </span>
            </div>

            {loadingSearch && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-[88px] w-full rounded-lg bg-white/5 animate-pulse" />
                ))}
              </div>
            )}
            {!loadingSearch && !results && !searchError && (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-8 text-center space-y-2">
                <Search className="size-5 mx-auto text-muted-foreground opacity-60" />
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">No search yet</p>
                <p className="text-xs text-muted-foreground">Enter a filter and press Search.</p>
              </div>
            )}
            {!loadingSearch && results && results.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center space-y-2">
                <AlertCircle className="size-5 mx-auto text-muted-foreground opacity-60" />
                <p className="text-xs font-semibold text-white">No flights found</p>
                <p className="text-xs text-muted-foreground">Try a different IATA or relax filters.</p>
                <Button variant="outline" size="sm" onClick={() => doSearch()} className="mt-2 h-7 text-xs border-white/10">
                  Retry
                </Button>
              </div>
            )}
            {results && results.length > 0 && (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
                {results.map((f) => {
                  const key = f.flightNumber ?? f.flightIata ?? `${f.airlineIata}-${f.departureIata}-${f.arrivalIata}-${Math.random()}`;
                  const isSelected = selected?.flightNumber === f.flightNumber || selected?.flightIata === f.flightIata;
                  return (
                    <button
                      key={key}
                      onClick={() => handleSelect(f)}
                      className={`w-full text-left rounded-lg border p-3 flex flex-col gap-2 transition-all text-left ${isSelected ? "bg-primary/10 border-primary/30 shadow-[0_0_20px_rgba(56,189,248,0.15)] ring-1 ring-primary/20" : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold flex items-center gap-1.5 text-white">
                          <Ticket className="size-3.5 text-primary shrink-0" />
                          {f.flightIata ?? f.flightNumber ?? "—"}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-widest font-semibold ${statusPillClasses(f.status)}`}>
                          {formatStatus(f.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                        <span className="flex items-center gap-1 truncate"><Building2 className="size-3 shrink-0" />{f.airlineName ?? f.airlineIata ?? "—"}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 truncate"><Plane className="size-3 shrink-0" />{f.aircraftRegistration ?? f.aircraftIata ?? "—"}</span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                        <div>
                          <div className="font-mono font-semibold text-white">{f.departureIata ?? "—"}</div>
                          <div className="text-muted-foreground truncate text-[11px]">{f.departureAirport ?? ""}</div>
                          <div className="text-muted-foreground font-mono text-[11px]">{f.departureScheduled ? formatTimestamp(f.departureScheduled) : f.departureEstimated ? formatTimestamp(f.departureEstimated) : ""}</div>
                        </div>
                        <div className="text-center text-muted-foreground font-mono text-[11px] px-2">→</div>
                        <div className="text-right">
                          <div className="font-mono font-semibold text-white">{f.arrivalIata ?? "—"}</div>
                          <div className="text-muted-foreground truncate text-[11px]">{f.arrivalAirport ?? ""}</div>
                          <div className="text-muted-foreground font-mono text-[11px]">{f.arrivalScheduled ? formatTimestamp(f.arrivalScheduled) : f.arrivalEstimated ? formatTimestamp(f.arrivalEstimated) : ""}</div>
                        </div>
                      </div>
                      {(f.departureDelay || f.arrivalDelay) && (
                        <div className="text-[11px] font-mono text-muted-foreground">Delay: DEP {f.departureDelay ?? "—"} • ARR {f.arrivalDelay ?? "—"}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT 40% MAP – sticky */}
      <div className="w-full lg:w-[40%] h-[42dvh] lg:h-[calc(100dvh-80px)] lg:sticky lg:top-20 shrink-0 relative bg-black border-t lg:border-t-0 lg:border-l border-white/5">
        <div className="absolute inset-0">
          <TrackingMap live={livePoint} departure={depPoint} arrival={arrPoint} altitude={tracking?.altitude} speed={tracking?.speed} heading={tracking?.direction} />
        </div>
        {/* premium glass top bar */}
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
          <div className="glass-panel-heavy px-3 py-1.5 rounded-full flex items-center gap-2 pointer-events-auto">
            <div className={`size-2 rounded-full ${livePoint ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-amber-500"}`} />
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] font-semibold text-white">
              {livePoint ? (airborne ? "Live • Airborne" : "Live • Ground") : "No Live Position"}
            </span>
          </div>
          {displayFlight && (
            <div className="glass-panel px-2.5 py-1 rounded-full hidden sm:flex items-center gap-1.5 pointer-events-auto">
              <Plane className="size-3 text-primary" />
              <span className="text-[11px] font-mono text-white font-semibold">{displayFlight.flightIata ?? displayFlight.flightNumber}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{displayFlight.departureIata}→{displayFlight.arrivalIata}</span>
            </div>
          )}
        </div>
        {/* bottom telemetry strip when airborne */}
        {livePoint && tracking && (
          <div className="absolute bottom-3 left-3 right-3 z-20 glass-panel rounded-lg px-3 py-2.5 hidden lg:flex items-center justify-between gap-3 pointer-events-none">
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="text-muted-foreground">ALT <span className="text-white font-semibold">{tracking.altitude ?? "—"} m</span></span>
              <span className="text-muted-foreground">SPD <span className="text-white font-semibold">{tracking.speed ?? "—"} km/h</span></span>
              <span className="text-muted-foreground">HDG <span className="text-white font-semibold">{tracking.direction != null ? `${Number(tracking.direction).toFixed(1)}°` : "—"}</span></span>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{tracking.liveUpdated ? formatTimestamp(tracking.liveUpdated) : ""}</span>
          </div>
        )}
        {/* subtle inner vignette */}
        <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_80px_rgba(0,0,0,0.6)] z-10" />
        {/* border glow */}
        <div className="absolute inset-0 pointer-events-none border border-white/5 z-10" />
      </div>
    </div>
  );
}

function DataBlock({ label, value, unit, icon }: { label: string; value: string | null; unit: string; icon?: React.ReactNode }) {
  const has = value != null && value !== "" && value !== "—";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-0.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1 font-semibold">
        {icon}
        {label}
      </p>
      <p className="font-mono text-sm text-white leading-none">
        {has ? value : "—"} {has ? <span className="text-xs text-muted-foreground font-normal">{unit}</span> : null}
      </p>
    </div>
  );
}
function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  const isEmpty = value == null || value === "" || (typeof value === "string" && value.trim() === "");
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-white/[0.04] last:border-0 text-xs">
      <span className="text-muted-foreground shrink-0 text-[11px] uppercase tracking-wider font-medium">{label}</span>
      <span className={`font-medium text-right break-words max-w-[62%] ${mono ? "font-mono text-white" : "text-white"}`}>{isEmpty ? "—" : (value as string)}</span>
    </div>
  );
}
function LiveRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-white/[0.04] last:border-0">
      <span className="text-muted-foreground shrink-0 text-[11px]">{label}</span>
      <span className={`text-right break-words font-medium max-w-[56%] ${mono ? "font-mono text-white text-xs" : "text-white text-xs"}`}>{value}</span>
    </div>
  );
}
