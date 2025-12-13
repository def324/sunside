<script lang="ts">
  import airportsData from '../data/airports.json';
  import { DateTime } from 'luxon';
  import { buildAirportSearchIndex, searchAirports } from '../core/airportSearch';
  import { createFlightPlan, estimateFlightDurationMinutes, sampleFlight, sampleFlightAt, type Airport } from '../core/flight';
  import { computeDayNightOverlay } from '../core/daynight';
	  import { createGreatCirclePath, splitPolylineAtMapSeam } from '../core/geo';
  import { toZonedDateTime, type LocalDateTimeInput } from '../core/time';

  type AirportRecord = (typeof airportsData)[number];

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
	  let autoEstimateArrival = true;
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
	  let playSpeed = 2;
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
			  type DistanceUnit = 'km' | 'mi' | 'nmi';
			  const AUTO_DISTANCE_UNIT: DistanceUnit = AUTO_USE_MILES ? 'mi' : 'km';
			  let distanceUnitOverride: DistanceUnit | null = null;
			  let distanceUnit: DistanceUnit = AUTO_DISTANCE_UNIT;
			  $: distanceUnit = distanceUnitOverride ?? AUTO_DISTANCE_UNIT;

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

	  type TimelineInfo = {
	    routeLabel: string;
	    utcDate: string;
	    utcTime: string;
	    localTime: string;
	    localOffset: string;
	    elapsed: string;
	    remaining: string;
	    status: 'day' | 'twilight' | 'night';
	    statusLabel: string;
	    directionLabel: string | null;
	  };

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

		  <section class="panel">
		    <h2>Flight setup</h2>
		    <div class="grid flight-setup-grid">
	      <label>
	        <span class="field-label">Departure airport</span>
	        <div class="field-control">
		        <div class="typeahead-wrap">
		          <input
		            type="search"
		            placeholder="Search IATA/ICAO/name"
		            bind:value={depQuery}
		            aria-label="Search departure airport"
		            on:focus={() => (showDepList = depQuery.trim().length > 0)}
		            on:input={() => (showDepList = depQuery.trim().length > 0)}
		            on:blur={() => setTimeout(() => (showDepList = false), 120)}
		          />
		          {#if showDepList && depOptions.length}
		            <ul class="typeahead">
		              {#each depOptions as option (`${option.ident}-${option.id}`)}
		                <li>
		                  <button
		                    type="button"
		                    class:selected={option === departureAirport}
				                    on:click={() => {
					                      departureAirport = option;
					                      depQuery = airportCode(option);
					                      showDepList = false;
					                    }}
					                  >
					                    {airportLabel(option)}
					                  </button>
		                </li>
		              {/each}
		            </ul>
		          {/if}
		        </div>
		        <small>{departureAirport.timeZone ?? departureAirport.tz}</small>
		      </div>
	      </label>
	      <label>
	        <span class="field-label">Departure local date/time</span>
	        <div class="field-control">
		        <div class="row datetime-row">
		          <input type="date" bind:value={departureDate} />
		          <input type="time" bind:value={departureTime} />
		        </div>
		      </div>
	      </label>
	      <label>
	        <span class="field-label">Arrival airport</span>
	        <div class="field-control">
		        <div class="typeahead-wrap">
		          <input
		            type="search"
		            placeholder="Search IATA/ICAO/name"
		            bind:value={arrQuery}
		            aria-label="Search arrival airport"
		            on:focus={() => (showArrList = arrQuery.trim().length > 0)}
		            on:input={() => (showArrList = arrQuery.trim().length > 0)}
		            on:blur={() => setTimeout(() => (showArrList = false), 120)}
		          />
		          {#if showArrList && arrOptions.length}
		            <ul class="typeahead">
		              {#each arrOptions as option (`${option.ident}-${option.id}`)}
		                <li>
		                  <button
		                    type="button"
		                    class:selected={option === arrivalAirport}
				                    on:click={() => {
					                      arrivalAirport = option;
					                      arrQuery = airportCode(option);
					                      showArrList = false;
					                    }}
					                  >
					                    {airportLabel(option)}
					                  </button>
		                </li>
		              {/each}
		            </ul>
		          {/if}
		        </div>
		        <small>{arrivalAirport.timeZone ?? arrivalAirport.tz}</small>
		      </div>
	      </label>
		      <label>
		        <span class="field-label">Arrival local date/time</span>
		        <div class="field-control">
			        <div class="row datetime-row">
			          <input type="date" bind:value={arrivalDate} />
			          <input type="time" bind:value={arrivalTime} />
			        </div>
			        <div class="checkbox-row">
			          <input type="checkbox" checked={autoEstimateArrival} on:change={onAutoEstimateArrivalChange} />
			          <span>Auto-estimate arrival time</span>
			        </div>
		        </div>
		      </label>
		    </div>
	    {#if error}
	      <p class="error">Error: {error}</p>
		    {/if}
		  </section>

	  <div class="desktop-layout">
	    <section class="panel timeline-panel">
	      <div class="timeline-header">
	        <h2>Timeline</h2>
	      {#if timelineInfo}
	        <div class="timeline-summary">
	          <span class="route">{timelineInfo.routeLabel}</span>
	          <span class="duration">{formatDuration(flightPlan?.durationMinutes ?? 0)}</span>
		          <button
		            type="button"
		            class="distance-toggle"
		            on:click={cycleDistanceUnit}
		            aria-label="Cycle distance units"
		            >
		              {formatDistance(flightPlan?.path.distanceMeters ?? 0, distanceUnit)}
		            </button>
		          </div>
		        {/if}
		      </div>

	      <div class="timeline-controls">
	        <button type="button" class="btn primary" on:click={togglePlayback} disabled={!flightPlan}>
	          {isPlaying ? 'Pause' : 'Play'}
	        </button>
	        <div class="pace-control" role="group" aria-label="Playback pace">
	          <span class="pace-label">Pace</span>
	          <div class="segmented">
	            <button
	              type="button"
	              class:active={playSpeed === 1}
	              on:click={() => (playSpeed = 1)}
	              disabled={!flightPlan}
	            >
	              Slow
	            </button>
	            <button type="button" class:active={playSpeed === 2} on:click={() => (playSpeed = 2)} disabled={!flightPlan}>
	              Normal
	            </button>
	            <button type="button" class:active={playSpeed === 4} on:click={() => (playSpeed = 4)} disabled={!flightPlan}>
	              Fast
	            </button>
	          </div>
	        </div>
	      </div>

			      {#if timelineInfo}
			        <div class="timeline-elapsed">Elapsed {timelineInfo.elapsed} · Remaining {timelineInfo.remaining}</div>
			      {/if}

			      <input
			        type="range"
			        min="0"
			        max="1"
			        step="any"
			        value={t}
			        on:input={onSliderInput}
			        disabled={!flightPlan}
			        aria-label="Flight timeline"
			      />

			      {#if flightPlan}
			        <div class="timeline-endpoints">
			          <div class="endpoint">
	            <div class="endpoint-kicker">Depart</div>
	            <div class="endpoint-main">{airportCode(departureAirport)} · {formatTime(flightPlan.departureUtc, departureAirport.tz)}</div>
	            <div class="endpoint-sub">{formatDate(flightPlan.departureUtc, departureAirport.tz)}</div>
	          </div>
	          <div class="endpoint endpoint-right">
	            <div class="endpoint-kicker">Arrive</div>
	            <div class="endpoint-main">{airportCode(arrivalAirport)} · {formatTime(flightPlan.arrivalUtc, arrivalAirport.tz)}</div>
	            <div class="endpoint-sub">{formatDate(flightPlan.arrivalUtc, arrivalAirport.tz)}</div>
	          </div>
	        </div>
	      {/if}

		    {#if timelineInfo}
		      <div class="timeline-cards">
		        <div class="timeline-card">
		          <div class="kicker">{timelineInfo.utcDate}</div>
		          <div class="value">{timelineInfo.utcTime} UTC</div>
		          <div class="sub">Local ≈ {timelineInfo.localTime} (UTC{timelineInfo.localOffset})</div>
		        </div>

		        <div class="timeline-card">
		          <div class="kicker">Sunlight</div>
	            <div class="badges">
	              <span class={`badge status-${timelineInfo.status}`}>{timelineInfo.statusLabel}</span>
	              {#if timelineInfo.directionLabel}
	                <span class="badge direction">{timelineInfo.directionLabel}</span>
	              {/if}
	            </div>
	          </div>
	        </div>
	      {/if}
	    </section>

	    <section class="panel map-panel">
	      <h2>Map</h2>
	      <div
	        class="map-wrap"
	        bind:this={mapWrapEl}
	        class:panning={isPanning}
	        on:wheel|preventDefault={(e) => onWheel(e)}
	        on:pointerdown={(e) => onPointerDown(e)}
	        on:pointermove={(e) => onPointerMove(e)}
	        on:pointerup={onPointerUp}
	        on:pointerleave={onPointerUp}
	      >
	        <div class="map-controls" aria-label="Map controls">
	          <button
	            type="button"
	            class="btn icon"
	            on:pointerdown|stopPropagation
	            on:click={() => zoomFromButtons('in')}
	            aria-label="Zoom in"
	          >
	            +
	          </button>
	          <button
	            type="button"
	            class="btn icon"
	            on:pointerdown|stopPropagation
	            on:click={() => zoomFromButtons('out')}
	            aria-label="Zoom out"
	          >
	            −
	          </button>
	        </div>
	        <svg bind:this={mapSvgEl} viewBox="0 0 1800 900" aria-label="World map">
	          <defs>
	            <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
	              <stop offset="0%" stop-color="#ffd166" stop-opacity="0.5" />
	              <stop offset="50%" stop-color="#ffd166" stop-opacity="0.25" />
	              <stop offset="100%" stop-color="#ffd166" stop-opacity="0" />
	            </radialGradient>
	            <clipPath id="map-clip">
	              <rect x="0" y="0" width="1800" height="900" />
	            </clipPath>
	          </defs>
	          <g transform={`translate(${viewX} ${viewY}) scale(${viewScale})`} clip-path="url(#map-clip)">
	            <image href="/map.svg" x="0" y="0" width="1800" height="900" />
	            {#if nightPath}
	              <path class="night" d={nightPath} />
	            {/if}
	            {#if dayPath}
	              <path class="day" d={dayPath} />
	            {/if}
	            {#if terminatorPath}
	              <path class="terminator" d={terminatorPath} />
	            {/if}
	            {#if routeSegments.length}
	              {#each routeSegments as points, i (i)}
	                <polyline class="route" points={points} />
	              {/each}
	            {/if}
	            {#if currentProjected}
	              <circle class="aircraft" cx={currentProjected.x} cy={currentProjected.y} r="6" />
	            {/if}
	            {#if sunProjected}
	              <g class="sun" transform={`translate(${sunProjected.x} ${sunProjected.y})`}>
	                <circle class="sun-glow" r="28" />
	                <circle class="sun-core" r="8" />
	              </g>
	            {/if}
	          </g>
	        </svg>
	      </div>
	    </section>
	  </div>
</main>

<style>
	  :global(body) {
	    margin: 0;
	    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
	    background: #0c1426;
	    color: #e6edf5;
	    color-scheme: dark;
	  }
	  main.page {
	    max-width: 1200px;
	    margin: 0 auto;
	    padding: 16px;
	    display: flex;
	    flex-direction: column;
	    gap: 16px;
	  }
	  .desktop-layout {
	    display: grid;
	    grid-template-columns: 1fr;
	    grid-template-areas:
	      'timeline'
	      'map';
	    gap: 16px;
	  }
	  .timeline-panel {
	    grid-area: timeline;
	  }
	  .map-panel {
	    grid-area: map;
	  }
		  @media (min-width: 1250px) {
		    .desktop-layout {
		      grid-template-columns: 2fr 1fr;
		      grid-template-areas: 'map timeline';
		      align-items: start;
		    }
		  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  h1 {
    margin: 0;
  }
  h2 {
    margin: 0 0 8px;
  }
	  .tagline {
	    margin: 4px 0 0;
	    color: #9fb0c7;
	  }
	  .panel {
	    background: #121d31;
	    border: 1px solid #24344c;
	    border-radius: 12px;
	    padding: 12px;
	    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
	  }
	  .timeline-header {
	    display: flex;
	    align-items: baseline;
	    justify-content: space-between;
	    gap: 12px;
	    flex-wrap: wrap;
	  }
		  .timeline-summary {
		    display: grid;
		    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		    align-items: baseline;
		    column-gap: 12px;
		    color: #d4deed;
		    font-weight: 650;
		    width: 100%;
		  }
		  .timeline-summary .duration {
		    justify-self: center;
		  }
		  .timeline-summary .route {
		    color: #e6edf5;
		    justify-self: start;
		    min-width: 0;
		    overflow: hidden;
		    text-overflow: ellipsis;
		    white-space: nowrap;
		  }
		  .timeline-summary .distance-toggle {
		    justify-self: end;
		    white-space: nowrap;
		  }
		  .timeline-summary .distance-toggle {
		    appearance: none;
		    border: none;
		    background: none;
		    padding: 0;
		    margin: 0;
		    color: inherit;
		    font: inherit;
		    font-weight: inherit;
		    cursor: default;
		  }
		  .timeline-summary .distance-toggle:focus-visible {
		    outline: 2px solid rgba(79, 209, 255, 0.55);
		    outline-offset: 3px;
		    border-radius: 6px;
		  }
		  .timeline-controls {
		    display: flex;
		    align-items: center;
		    justify-content: space-between;
	    gap: 12px;
	    flex-wrap: wrap;
	    margin: 6px 0 10px;
	  }
	  .btn {
	    appearance: none;
	    border: 1px solid #24344c;
	    border-radius: 10px;
	    padding: 8px 12px;
	    background: #0d182b;
	    color: #e6edf5;
	    font-weight: 650;
	    cursor: pointer;
	  }
	  .btn.primary {
	    border-color: rgba(79, 209, 255, 0.35);
	    background: rgba(79, 209, 255, 0.12);
	  }
	  .btn.icon {
	    width: 38px;
	    height: 38px;
	    padding: 0;
	    border-radius: 12px;
	    display: inline-flex;
	    align-items: center;
	    justify-content: center;
	    font-size: 20px;
	    line-height: 1;
	    user-select: none;
	  }
	  .btn:disabled {
	    opacity: 0.55;
	    cursor: not-allowed;
	  }
	  .pace-control {
	    display: flex;
	    align-items: center;
	    gap: 10px;
	    color: #9fb0c7;
	  }
	  .pace-label {
	    font-size: 12px;
	  }
	  .segmented {
	    display: inline-flex;
	    border: 1px solid #24344c;
	    border-radius: 999px;
	    overflow: hidden;
	    background: rgba(13, 24, 43, 0.8);
	  }
	  .segmented button {
	    appearance: none;
	    border: none;
	    background: transparent;
	    color: #cbd5e1;
	    padding: 6px 10px;
	    font: inherit;
	    font-size: 13px;
	    cursor: pointer;
	  }
	  .segmented button + button {
	    border-left: 1px solid #24344c;
	  }
	  .segmented button.active {
	    background: rgba(79, 209, 255, 0.12);
	    color: #e6edf5;
	  }
	  .segmented button:disabled {
	    opacity: 0.55;
	    cursor: not-allowed;
	  }
	  .timeline-endpoints {
	    display: flex;
	    justify-content: space-between;
	    gap: 12px;
	    margin: 6px 0 0;
	  }
	  .endpoint {
	    min-width: 120px;
	  }
	  .endpoint-right {
	    text-align: right;
	  }
	  .endpoint-kicker {
	    color: #9fb0c7;
	    font-size: 11px;
	    letter-spacing: 0.04em;
	    text-transform: uppercase;
	  }
	  .endpoint-main {
	    color: #e6edf5;
	    font-weight: 650;
	    margin-top: 2px;
	  }
	  .endpoint-sub {
	    color: #9fb0c7;
	    font-size: 12px;
	    margin-top: 2px;
	  }
	  .timeline-cards {
	    margin-top: 12px;
	    display: grid;
	    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	    gap: 12px;
	  }
	  .timeline-card {
	    background: #0d182b;
	    border: 1px solid #24344c;
	    border-radius: 12px;
	    padding: 10px;
	  }
	  .kicker {
	    color: #9fb0c7;
	    font-size: 12px;
	  }
	  .value {
	    margin-top: 6px;
	    font-weight: 750;
	    letter-spacing: 0.01em;
	    color: #e6edf5;
	  }
	  .sub {
	    margin-top: 6px;
	    color: #cbd5e1;
	    font-size: 12px;
	    line-height: 1.35;
	  }
	  .timeline-elapsed {
	    margin: 0 0 4px;
	    text-align: center;
	    font-size: 12px;
	    font-weight: 500;
	    color: #9fb0c7;
	  }
	  .badges {
	    margin-top: 8px;
	    display: flex;
	    flex-wrap: wrap;
	    gap: 8px;
	  }
	  .badge {
	    display: inline-flex;
	    align-items: center;
	    padding: 4px 10px;
	    border-radius: 999px;
	    border: 1px solid #24344c;
	    font-size: 12px;
	    font-weight: 650;
	    color: #e6edf5;
	    background: rgba(148, 163, 184, 0.08);
	  }
	  .badge.status-day {
	    border-color: rgba(255, 209, 102, 0.35);
	    background: rgba(255, 209, 102, 0.12);
	    color: #ffd166;
	  }
	  .badge.status-twilight {
	    border-color: rgba(251, 191, 36, 0.35);
	    background: rgba(251, 191, 36, 0.12);
	    color: #fbbf24;
	  }
	  .badge.status-night {
	    border-color: rgba(148, 163, 184, 0.22);
	    background: rgba(148, 163, 184, 0.08);
	    color: #cbd5e1;
	  }
	  .badge.direction {
	    border-color: rgba(79, 209, 255, 0.25);
	    background: rgba(79, 209, 255, 0.08);
	  }
	  label {
	    display: flex;
	    flex-direction: column;
	    gap: 6px;
	    color: #d4deed;
	  }
	  .field-label {
	    display: block;
	  }
		  .field-control {
		    display: flex;
		    flex-direction: column;
		    gap: 6px;
		    min-width: 0;
		  }
		  .field-control small {
		    display: block;
		    margin-left: 8px;
		  }
	  input[type='search'],
	  input[type='date'],
	  input[type='time'],
	  input[type='range'] {
		    width: 100%;
		    box-sizing: border-box;
		    padding: 8px;
		    border-radius: 8px;
		    border: 1px solid #24344c;
		    background: #0d182b;
		    color: #e6edf5;
		    font: inherit;
		  }
		  input[type='search'],
		  input[type='date'],
		  input[type='time'] {
		    height: 40px;
		  }
		  input[type='date'],
		  input[type='time'] {
		    font-variant-numeric: proportional-nums;
		  }
		  input[type='date'],
		  input[type='time'] {
		    color-scheme: dark;
		  }
		  input[type='date']::-webkit-calendar-picker-indicator,
		  input[type='time']::-webkit-calendar-picker-indicator {
		    filter: invert(1);
		    opacity: 0.85;
		  }
		  input[type='date']::-webkit-calendar-picker-indicator:hover,
		  input[type='time']::-webkit-calendar-picker-indicator:hover {
		    opacity: 1;
		  }
	  input[type='range'] {
	    padding: 0;
	    accent-color: #4fd1ff;
	  }
	  .grid {
	    display: grid;
	    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	    gap: 12px;
	  }
	  .flight-setup-grid {
	    grid-template-columns: repeat(2, minmax(0, 1fr));
	  }
  .row {
    display: flex;
    gap: 8px;
  }
	  .row input {
	    flex: 1;
	  }
	  .checkbox-row {
	    display: flex;
	    align-items: center;
	    gap: 10px;
	    margin-top: 8px;
	    color: #9fb0c7;
	    font-size: 13px;
	  }
	  .checkbox-row input {
	    width: 16px;
	    height: 16px;
	    accent-color: #4fd1ff;
	  }
	  .typeahead {
	    position: absolute;
	    top: 100%;
	    left: 0;
    right: 0;
    z-index: 10;
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    max-height: 220px;
    overflow: auto;
    border: 1px solid #24344c;
    border-radius: 8px;
    background: #0e1930;
  }
  .typeahead li + li {
    border-top: 1px solid #19263b;
  }
  .typeahead button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    background: none;
    border: none;
    color: #e6edf5;
    cursor: pointer;
  }
  .typeahead button:hover,
  .typeahead button.selected {
    background: #1a2841;
  }
  .typeahead-wrap {
    position: relative;
  }
	  .error {
	    color: #f87171;
	    margin: 8px 0 0;
	  }
	  .map-wrap {
	    background: #0e1930;
	    border-radius: 12px;
	    padding: 0;
	    border: 1px solid #24344c;
	    overflow: hidden;
	    position: relative;
	    touch-action: none;
	    user-select: none;
	    cursor: grab;
	  }
	  .map-controls {
	    position: absolute;
	    right: 12px;
	    bottom: 12px;
	    display: flex;
	    flex-direction: column;
	    gap: 8px;
	    z-index: 5;
	  }
  .map-wrap.panning {
    cursor: grabbing;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
  }
  image {
    opacity: 0.92;
  }
  .night,
  .day,
  .terminator,
  .sun {
    pointer-events: none;
  }
  .night {
    fill: rgba(5, 10, 18, 0.28);
  }
  .day {
    fill: rgba(255, 209, 102, 0.14);
    mix-blend-mode: screen;
  }
  .terminator {
    fill: none;
    stroke: #ffd166;
    stroke-opacity: 0.45;
    stroke-width: 1.5;
    stroke-dasharray: 6 6;
  }
  .route {
    fill: none;
    stroke: #4fd1ff;
    stroke-width: 2.2;
  }
  .aircraft {
    fill: #ffd166;
    stroke: #0c1426;
    stroke-width: 1.4;
  }
  .sun-glow {
    fill: url(#sun-glow);
  }
  .sun-core {
    fill: #ffd166;
    stroke: #0c1426;
    stroke-width: 1.25;
    filter: drop-shadow(0 0 6px rgba(255, 209, 102, 0.4));
  }
		  @media (max-width: 640px) {
		    header {
		      flex-direction: column;
		      align-items: flex-start;
		    }
		    .flight-setup-grid {
		      grid-template-columns: 1fr;
		      gap: 10px;
		    }
	    .flight-setup-grid label {
	      display: grid;
	      grid-template-columns: minmax(7.5rem, 38%) 1fr;
	      gap: 10px;
	      align-items: start;
	    }
	    .flight-setup-grid .field-label {
	      font-size: 13px;
	      line-height: 1.2;
	      padding-top: 6px;
	    }
		    .flight-setup-grid .field-control {
		      min-width: 0;
		    }
			    .flight-setup-grid .datetime-row {
			      display: grid;
			      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
			      gap: 8px;
		    }
		  }
		  @media (min-width: 1250px) {
		    .flight-setup-grid {
		      grid-template-columns: repeat(4, minmax(0, 1fr));
		    }
		  }
		</style>
