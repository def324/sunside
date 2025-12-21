<script lang="ts">
  import airportsData from '../data/airports.json';
  import { DateTime } from 'luxon';
  import FlightSetupPanel from './components/FlightSetupPanel.svelte';
  import MapPanel from './components/MapPanel.svelte';
  import TimelinePanel from './components/TimelinePanel.svelte';
  import { buildAirportSearchIndex, searchAirports } from '../core/airportSearch';
  import { createFlightPlan, estimateFlightDurationMinutes, sampleFlight, sampleFlightAt, type Airport } from '../core/flight';
  import { computeDayNightOverlay } from '../core/daynight';
		  import { createGreatCirclePath, splitPolylineAtMapSeam } from '../core/geo';
  import { toZonedDateTime, type LocalDateTimeInput } from '../core/time';
  import type { AirportRecord, DistanceUnit, PlaybackSpeed, TimelineInfo } from './types';

  type PersistedPrefsV1 = {
    autoEstimateArrival?: boolean;
    distanceUnitOverride?: DistanceUnit | null;
    playSpeed?: PlaybackSpeed;
  };

  const PREFS_STORAGE_KEY = 'sunside:prefs:v1';

  function readPrefs(): PersistedPrefsV1 {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};

      const obj = parsed as Record<string, unknown>;
      const prefs: PersistedPrefsV1 = {};

      if (typeof obj.autoEstimateArrival === 'boolean') prefs.autoEstimateArrival = obj.autoEstimateArrival;

      const du = obj.distanceUnitOverride;
      if (du === null) prefs.distanceUnitOverride = null;
      if (du === 'km' || du === 'mi' || du === 'nmi') prefs.distanceUnitOverride = du;

      const ps = obj.playSpeed;
      if (ps === 1 || ps === 2 || ps === 4) prefs.playSpeed = ps;

      return prefs;
    } catch {
      return {};
    }
  }

  const persistedPrefs = readPrefs();

  const airports: AirportRecord[] = airportsData;
  const airportSearchIndex = buildAirportSearchIndex(airports);

  const ROUTE_SAMPLE_COUNT = 180;
  const MAP_WIDTH = 1800;
  const MAP_HEIGHT = 900;

  const defaultDeparture = airports.find((a) => a.iata === 'AMS') ?? airports[0];
  const defaultArrival =
    airports.find((a) => a.iata === 'GRU') ??
    airports.find((a) => a.iata === 'LHR') ??
    airports.find((a) => a.iata === 'CDG') ??
    airports.find((a) => a.iata === 'JFK') ??
    airports[1];

  let departureAirport: AirportRecord = defaultDeparture;
  let arrivalAirport: AirportRecord = defaultArrival;
  let depQuery = (defaultDeparture.iata ?? defaultDeparture.icao ?? defaultDeparture.ident) ?? '';
  let arrQuery = (defaultArrival.iata ?? defaultArrival.icao ?? defaultArrival.ident) ?? '';
  let showDepList = false;
  let showArrList = false;

  const today = new Date();
  const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const toTimeStr = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

	  let departureDate = toDateStr(today);
		  let departureTime = toTimeStr(11, 0);
		  let arrivalDate = toDateStr(today);
		  let arrivalTime = toTimeStr(19, 0);
		  let autoEstimateArrival = persistedPrefs.autoEstimateArrival ?? true;
		  let lastArrivalEstimateKey = `${departureAirport.id}|${arrivalAirport.id}|${departureDate}|${departureTime}`;

  let error = '';
  let flightPlan = null as ReturnType<typeof createFlightPlan> | null;
  let routeSamples = [] as ReturnType<typeof sampleFlight>;
	  let t = 0;
	  let sliderValue = 0;
	  let routeSegments = [] as string[];
	  let currentProjected: { x: number; y: number } | null = null;
  let currentSample: ReturnType<typeof sampleFlight>[number] | null = null;
  let sunProjected: { x: number; y: number } | null = null;
  let dayPath = '';
  let nightPath = '';
  let terminatorPath = '';
  let pendingRaf: number | null = null;
  let viewX = 0;
	  let viewY = 0;
	  let viewScale = 1;
		  let isPanning = false;
		  let panStart: { x: number; y: number; startViewX: number; startViewY: number } | null = null;
		  let isPlaying = false;
		  let playSpeed: PlaybackSpeed = persistedPrefs.playSpeed ?? 2;
		  let playRaf: number | null = null;
		  let lastPlayTs: number | null = null;
  const PLAYBACK_DURATION_SECONDS = 30;
  const PLAYBACK_FPS = 30;
	  const numberFmt = new Intl.NumberFormat(undefined);
	  const MIN_SCALE = 1;
	  const MAX_SCALE = 6;
	  let mapWrapEl: HTMLDivElement | null = null;
	  let mapSvgEl: SVGSVGElement | null = null;
	  const activePointers = new Map<number, { x: number; y: number }>();
	  let pinchStart:
	    | {
	        distance: number;
        startScale: number;
        startViewX: number;
        startViewY: number;
        startCenter: { x: number; y: number };
        pre: { x: number; y: number };
      }
    | null = null;

  function toAirport(a: AirportRecord): Airport {
    return {
      id: a.id,
      name: a.name,
      city: a.city ?? '',
      country: a.country,
      location: { lat: a.lat, lon: a.lon },
      timeZone: a.tz,
      iata: a.iata ?? undefined,
      icao: a.icao ?? undefined
    };
  }

  function parseLocal(date: string, time: string): LocalDateTimeInput {
    const [year, month, day] = date.split('-').map((n) => Number(n));
    const [hour, minute] = time.split(':').map((n) => Number(n));
    return { year, month, day, hour, minute };
  }

  function applyArrivalEstimate() {
    try {
      const depZ = toZonedDateTime(parseLocal(departureDate, departureTime), departureAirport.tz);
      const path = createGreatCirclePath(toAirport(departureAirport).location, toAirport(arrivalAirport).location);
      const durationMinutes = estimateFlightDurationMinutes(path.distanceMeters, { roundToMinutes: 30 });
      const arrivalUtcMillis = depZ.millis + durationMinutes * 60_000;
      const arrivalDt = DateTime.fromMillis(arrivalUtcMillis, { zone: arrivalAirport.tz });
      const nextArrivalDate = arrivalDt.toISODate() ?? arrivalDate;
      const nextArrivalTime = arrivalDt.toFormat('HH:mm');
      if (arrivalDate !== nextArrivalDate) arrivalDate = nextArrivalDate;
      if (arrivalTime !== nextArrivalTime) arrivalTime = nextArrivalTime;
    } catch {}
  }

	  function onAutoEstimateArrivalChange(event: Event) {
	    const input = event.currentTarget as HTMLInputElement;
	    autoEstimateArrival = input.checked;
	  }

	  $: depOptions = depQuery.trim() ? searchAirports(airportSearchIndex, depQuery, 20) : [];
	  $: arrOptions = arrQuery.trim() ? searchAirports(airportSearchIndex, arrQuery, 20) : [];

	  $: {
	    if (!autoEstimateArrival) {
	      lastArrivalEstimateKey = '';
	    } else {
	      const key = `${departureAirport.id}|${arrivalAirport.id}|${departureDate}|${departureTime}`;
	      if (key !== lastArrivalEstimateKey) {
	        lastArrivalEstimateKey = key;
	        applyArrivalEstimate();
	      }
	    }
	  }

	  $: {
	    error = '';
	    flightPlan = null;
	    routeSamples = [];
	    routeSegments = [];
	    try {
      const depLocal = parseLocal(departureDate, departureTime);
      const arrLocal = parseLocal(arrivalDate, arrivalTime);
      const depZ = toZonedDateTime(depLocal, departureAirport.tz);
      const arrZ = toZonedDateTime(arrLocal, arrivalAirport.tz);
	      const plan = createFlightPlan(toAirport(departureAirport), toAirport(arrivalAirport), depZ, arrZ);
	      flightPlan = plan;
	      routeSamples = sampleFlight(plan, ROUTE_SAMPLE_COUNT, { width: MAP_WIDTH, height: MAP_HEIGHT });
	      const projected = routeSamples.map((s) => s.projected!).filter(Boolean);
	      routeSegments = splitPolylineAtMapSeam(projected, MAP_WIDTH)
	        .filter((seg) => seg.length >= 2)
	        .map((seg) => seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
	    } catch (e: any) {
	      error = e?.message ?? 'Unable to create flight plan';
	    }
	  }

  $: if (t > 1) t = 1;

  $: if (t < 0) t = 0;

  $: {
    if (!flightPlan) {
      currentSample = null;
      currentProjected = null;
    } else {
      currentSample = sampleFlightAt(flightPlan, t, { width: MAP_WIDTH, height: MAP_HEIGHT });
      currentProjected = currentSample.projected ?? null;
    }
  }

  $: {
    const timestamp = currentSample?.utcMillis ?? Date.now();
    updateSunGraphics(timestamp);
  }

  function onSliderInput(event: Event) {
    if (isPlaying) stopPlayback();
    const input = event.currentTarget as HTMLInputElement;
    sliderValue = Number(input.value);
    if (pendingRaf !== null) {
      return;
    }
    pendingRaf = requestAnimationFrame(() => {
      t = sliderValue;
      pendingRaf = null;
    });
  }

  function stopPlayback() {
    if (playRaf !== null) {
      cancelAnimationFrame(playRaf);
      playRaf = null;
    }
    lastPlayTs = null;
    isPlaying = false;
  }

  function tickPlayback(now: number) {
    if (!isPlaying) return;
    if (!flightPlan) {
      stopPlayback();
      return;
    }

    if (lastPlayTs === null) {
      lastPlayTs = now;
      playRaf = requestAnimationFrame(tickPlayback);
      return;
    }

    const elapsedMs = now - lastPlayTs;
    if (elapsedMs < 1000 / PLAYBACK_FPS) {
      playRaf = requestAnimationFrame(tickPlayback);
      return;
    }

    lastPlayTs = now;
    const dt = (elapsedMs / 1000 / PLAYBACK_DURATION_SECONDS) * playSpeed;
    t = Math.min(1, t + dt);
    if (t >= 1) {
      stopPlayback();
      return;
    }
    playRaf = requestAnimationFrame(tickPlayback);
  }

  function togglePlayback() {
    if (!flightPlan) return;
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (t >= 0.999) t = 0;
	    isPlaying = true;
	    lastPlayTs = null;
	    playRaf = requestAnimationFrame(tickPlayback);
	  }

	  function getSvgMetrics(): { rect: DOMRect; sx: number; sy: number } | null {
	    if (!mapSvgEl) return null;
	    const rect = mapSvgEl.getBoundingClientRect();
	    if (rect.width <= 0 || rect.height <= 0) return null;
	    return { rect, sx: MAP_WIDTH / rect.width, sy: MAP_HEIGHT / rect.height };
	  }

	  function clampToMap(x: number, y: number): { x: number; y: number } {
	    return { x: Math.min(MAP_WIDTH, Math.max(0, x)), y: Math.min(MAP_HEIGHT, Math.max(0, y)) };
	  }

	  function onWheel(event: WheelEvent) {
	    const metrics = getSvgMetrics();
	    if (!metrics) return;
	    const rawX = (event.clientX - metrics.rect.left) * metrics.sx;
	    const rawY = (event.clientY - metrics.rect.top) * metrics.sy;
	    const { x, y } = clampToMap(rawX, rawY);
	    zoomByWheelDelta(event.deltaY, x, y, event.ctrlKey);
	  }

  function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }

  function clampPan() {
    const minX = -MAP_WIDTH * (viewScale - 1);
    const minY = -MAP_HEIGHT * (viewScale - 1);
    viewX = Math.min(0, Math.max(minX, viewX));
    viewY = Math.min(0, Math.max(minY, viewY));
  }

  function zoomToScale(newScale: number, cx: number, cy: number, start?: { scale: number; viewX: number; viewY: number }) {
    const fromScale = start?.scale ?? viewScale;
    const fromX = start?.viewX ?? viewX;
    const fromY = start?.viewY ?? viewY;
    const clamped = clampScale(newScale);
    const preX = (cx - fromX) / fromScale;
    const preY = (cy - fromY) / fromScale;
    viewScale = clamped;
    viewX = cx - preX * viewScale;
    viewY = cy - preY * viewScale;
    clampPan();
  }

  function zoomByFactor(factor: number, cx: number, cy: number) {
    zoomToScale(viewScale * factor, cx, cy);
  }

  function zoomByWheelDelta(deltaY: number, cx: number, cy: number, isPinch: boolean) {
    const dy = Math.max(-200, Math.min(200, deltaY));
    const intensity = isPinch ? 0.0035 : 0.0015;
    const factor = Math.exp(-dy * intensity);
    zoomByFactor(factor, cx, cy);
  }

	  function zoomFromButtons(direction: 'in' | 'out') {
	    const factor = direction === 'in' ? 1.25 : 1 / 1.25;
	    zoomByFactor(factor, MAP_WIDTH / 2, MAP_HEIGHT / 2);
	  }

	  function onPointerDown(event: PointerEvent) {
	    event.preventDefault();
	    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

	    if (activePointers.size === 1) {
	      isPanning = true;
	      panStart = { x: event.clientX, y: event.clientY, startViewX: viewX, startViewY: viewY };
	      pinchStart = null;
	      return;
	    }

	    if (activePointers.size === 2) {
	      const metrics = getSvgMetrics();
	      if (!metrics) return;
	      isPanning = false;
	      panStart = null;
	      const pts = [...activePointers.values()];
	      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
	      const centerClient = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
	      const rawCenterX = (centerClient.x - metrics.rect.left) * metrics.sx;
	      const rawCenterY = (centerClient.y - metrics.rect.top) * metrics.sy;
	      const center = clampToMap(rawCenterX, rawCenterY);
	      pinchStart = {
	        distance: dist,
	        startScale: viewScale,
	        startViewX: viewX,
	        startViewY: viewY,
	        startCenter: center,
	        pre: { x: (center.x - viewX) / viewScale, y: (center.y - viewY) / viewScale }
	      };
	    }
	  }

	  function onPointerMove(event: PointerEvent) {
	    if (activePointers.has(event.pointerId)) {
	      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
	    }

	    if (pinchStart && activePointers.size >= 2) {
	      const metrics = getSvgMetrics();
	      if (!metrics) return;
	      const pts = [...activePointers.values()];
	      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
	      const centerClient = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
	      const rawCenterX = (centerClient.x - metrics.rect.left) * metrics.sx;
	      const rawCenterY = (centerClient.y - metrics.rect.top) * metrics.sy;
	      const center = clampToMap(rawCenterX, rawCenterY);
	      const rawScale = pinchStart.startScale * (dist / pinchStart.distance);
	      const newScale = clampScale(rawScale);
	      viewScale = newScale;
	      viewX = center.x - pinchStart.pre.x * viewScale;
      viewY = center.y - pinchStart.pre.y * viewScale;
      clampPan();
      return;
	    }

	    if (!isPanning || !panStart) return;
	    const metrics = getSvgMetrics();
	    if (!metrics) return;
	    viewX = panStart.startViewX + (event.clientX - panStart.x) * metrics.sx;
	    viewY = panStart.startViewY + (event.clientY - panStart.y) * metrics.sy;
	    clampPan();
	  }

  function onPointerUp(event?: PointerEvent) {
    isPanning = false;
    panStart = null;
    if (event) {
      activePointers.delete(event.pointerId);
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }
    if (activePointers.size < 2) {
      pinchStart = null;
    }
  }

  const airportLabel = (a: AirportRecord) => `${a.iata ?? a.icao ?? a.ident} — ${a.name}`;
  const airportCode = (a: AirportRecord) => a.iata ?? a.icao ?? a.ident;

  function formatDuration(mins: number): string {
    const total = Math.max(0, Math.round(mins));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h <= 0) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

		  function shouldUseMiles(): boolean {
		    const localeStr =
		      (typeof Intl !== 'undefined' && Intl.NumberFormat ? new Intl.NumberFormat().resolvedOptions().locale : undefined) ??
		      (typeof navigator !== 'undefined' ? navigator.language : undefined) ??
		      'en';

		    if (typeof Intl !== 'undefined' && 'Locale' in Intl && typeof (Intl as unknown as { Locale?: unknown }).Locale === 'function') {
		      try {
		        const locale = new Intl.Locale(localeStr);
		        const ms = (locale as unknown as { measurementSystem?: string }).measurementSystem;
		        if (ms === 'ussystem' || ms === 'uksystem') return true;
		        const region = locale.region?.toUpperCase();
		        return region === 'US' || region === 'GB' || region === 'LR' || region === 'MM';
		      } catch {}
		    }

		    const match = localeStr.replace('_', '-').match(/-([A-Za-z]{2})\b/);
		    const region = match?.[1]?.toUpperCase();
		    return region === 'US' || region === 'GB' || region === 'LR' || region === 'MM';
				  }

				  const AUTO_USE_MILES = shouldUseMiles();
				  const AUTO_DISTANCE_UNIT: DistanceUnit = AUTO_USE_MILES ? 'mi' : 'km';
				  let distanceUnitOverride: DistanceUnit | null = persistedPrefs.distanceUnitOverride ?? null;
				  let distanceUnit: DistanceUnit = AUTO_DISTANCE_UNIT;
				  $: distanceUnit = distanceUnitOverride ?? AUTO_DISTANCE_UNIT;

				  type PrefsToPersist = {
				    autoEstimateArrival: boolean;
				    distanceUnitOverride: DistanceUnit | null;
				    playSpeed: PlaybackSpeed;
				  };

				  let prefsReady = false;
				  let prefsLastJson = '';
				  let prefsSaveTimeout: ReturnType<typeof setTimeout> | null = null;

				  function writePrefs(prefs: PrefsToPersist) {
				    if (!prefsReady) return;
				    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
				    const json = JSON.stringify(prefs);
				    if (json === prefsLastJson) return;
				    prefsLastJson = json;
				    try {
				      localStorage.setItem(PREFS_STORAGE_KEY, json);
				    } catch {}
				  }

				  function schedulePrefsSave(prefs: PrefsToPersist) {
				    if (!prefsReady) return;
				    if (prefsSaveTimeout) clearTimeout(prefsSaveTimeout);
				    prefsSaveTimeout = setTimeout(() => {
				      prefsSaveTimeout = null;
				      writePrefs(prefs);
				    }, 150);
				  }

				  prefsLastJson = JSON.stringify({ autoEstimateArrival, distanceUnitOverride, playSpeed });
				  prefsReady = true;

				  $: if (prefsReady) schedulePrefsSave({ autoEstimateArrival, distanceUnitOverride, playSpeed });

				  function cycleDistanceUnit() {
				    const next: DistanceUnit = distanceUnit === 'km' ? 'mi' : distanceUnit === 'mi' ? 'nmi' : 'km';
				    distanceUnitOverride = next;
				  }

			  function formatDistance(meters: number, unit: DistanceUnit): string {
			    if (unit === 'km') return `${numberFmt.format(Math.round(meters / 1000))} km`;
			    if (unit === 'mi') return `${numberFmt.format(Math.round(meters / 1609.344))} mi`;
			    return `${numberFmt.format(Math.round(meters / 1852))} nmi`;
			  }

		  function utcOffsetLabel(offsetMinutes: number): string {
		    if (offsetMinutes === 0) return '+00:00';
		    const sign = offsetMinutes >= 0 ? '+' : '-';
		    const abs = Math.abs(offsetMinutes);
		    const h = Math.floor(abs / 60);
		    const m = abs % 60;
		    return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
		  }

  function approxLocalOffsetMinutes(lonDeg: number): number {
    const rawMinutes = (lonDeg / 15) * 60;
    return Math.round(rawMinutes / 15) * 15;
  }

  function formatTime(ms: number, zone: string): string {
    return DateTime.fromMillis(ms, { zone }).toLocaleString(DateTime.TIME_SIMPLE);
  }

  function formatDate(ms: number, zone: string): string {
    return DateTime.fromMillis(ms, { zone }).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY);
  }

  function daylightLabel(status: string): string {
    if (status === 'day') return 'Daylight';
    if (status === 'twilight') return 'Twilight';
    return 'Night';
  }

  function sideLabel(side: string): string {
    if (side === 'left') return 'Sun on left side';
    if (side === 'right') return 'Sun on right side';
    if (side === 'ahead') return 'Sun ahead';
    return 'Sun behind';
  }

  let timelineInfo: TimelineInfo | null = null;
  $: {
    if (!flightPlan || !currentSample) {
      timelineInfo = null;
    } else {
      const utcMillis = currentSample.utcMillis;
      const utcDate = formatDate(utcMillis, 'utc');
      const utcTime = formatTime(utcMillis, 'utc');
      const offsetMinutes = approxLocalOffsetMinutes(currentSample.location.lon);
      const localTime = DateTime.fromMillis(utcMillis, { zone: 'utc' })
        .plus({ minutes: offsetMinutes })
        .toLocaleString(DateTime.TIME_SIMPLE);
      const localOffset = utcOffsetLabel(offsetMinutes);
	      const elapsedMinutes = Math.max(0, Math.round((utcMillis - flightPlan.departureUtc) / 60000));
	      const remainingMinutes = Math.max(0, flightPlan.durationMinutes - elapsedMinutes);
	      const status = currentSample.sun.status;
	      const directionLabel = status === 'night' ? null : sideLabel(currentSample.sun.side);

	      timelineInfo = {
	        routeLabel: `${airportCode(departureAirport)} → ${airportCode(arrivalAirport)}`,
	        utcDate,
	        utcTime,
	        localTime,
	        localOffset,
	        elapsed: formatDuration(elapsedMinutes),
	        remaining: formatDuration(remainingMinutes),
	        status,
	        statusLabel: daylightLabel(status),
	        directionLabel
	      };
	    }
	  }

  function updateSunGraphics(timestamp: number) {
    const overlay = computeDayNightOverlay(timestamp, MAP_WIDTH, MAP_HEIGHT);
    sunProjected = overlay.sun;
    terminatorPath = overlay.terminatorPath;
    dayPath = overlay.dayPath;
    nightPath = overlay.nightPath;
  }
</script>

<main class="page">
  <header>
    <div>
      <h1>Sunside</h1>
      <p class="tagline">Flight sunlight visualizer</p>
    </div>
  </header>

  <FlightSetupPanel
    bind:departureAirport
    bind:arrivalAirport
    bind:depQuery
    bind:arrQuery
    bind:showDepList
    bind:showArrList
    {depOptions}
    {arrOptions}
    bind:departureDate
    bind:departureTime
    bind:arrivalDate
    bind:arrivalTime
    {autoEstimateArrival}
    {onAutoEstimateArrivalChange}
    {airportCode}
    {airportLabel}
    {error}
  />

  <div class="desktop-layout">
    <TimelinePanel
      {timelineInfo}
      {flightPlan}
      {departureAirport}
      {arrivalAirport}
      {airportCode}
      {formatDuration}
      {formatDistance}
      {cycleDistanceUnit}
      {distanceUnit}
      {isPlaying}
      {togglePlayback}
      bind:playSpeed
      {t}
      {onSliderInput}
      {formatTime}
      {formatDate}
    />

    <MapPanel
      bind:mapWrapEl
      bind:mapSvgEl
      mapWidth={MAP_WIDTH}
      mapHeight={MAP_HEIGHT}
      {viewX}
      {viewY}
      {viewScale}
      {isPanning}
      {onWheel}
      {onPointerDown}
      {onPointerMove}
      {onPointerUp}
      {zoomFromButtons}
      {nightPath}
      {dayPath}
      {terminatorPath}
      {routeSegments}
      {currentProjected}
      {sunProjected}
    />
  </div>
</main>
