<script lang="ts">
  import airportsData from '../data/airports.json';
  import { createFlightPlan, sampleFlight, type Airport } from '../core/flight';
  import { projectEquirectangular } from '../core/geo';
  import { getSubsolarPoint, sampleTerminatorCircle } from '../core/sun';
  import { toZonedDateTime, type LocalDateTimeInput } from '../core/time';

  type AirportRecord = (typeof airportsData)[number];

  const airports: AirportRecord[] = airportsData;

  const SAMPLE_COUNT = 30;
  const MAP_WIDTH = 1800;
  const MAP_HEIGHT = 900;

  const defaultDeparture = airports.find((a) => a.iata === 'LAX') ?? airports[0];
  const defaultArrival = airports.find((a) => a.iata === 'JFK') ?? airports[1];

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
  let departureTime = toTimeStr(9, 0);
  let arrivalDate = toDateStr(today);
  let arrivalTime = toTimeStr(15, 0);

  let error = '';
  let flightPlan = null as ReturnType<typeof createFlightPlan> | null;
  let samples = [] as ReturnType<typeof sampleFlight>;
  let t = 0;
  let sliderValue = 0;
  let routePoints = '';
  let currentProjected: { x: number; y: number } | null = null;
  let currentSample: ReturnType<typeof sampleFlight>[number] | null = null;
  let sunProjected: { x: number; y: number } | null = null;
  let dayPath = '';
  let nightPath = '';
  let terminatorPoints = '';
  let pendingRaf: number | null = null;
  let viewX = 0;
  let viewY = 0;
  let viewScale = 1;
  let isPanning = false;
  let panStart: { x: number; y: number } | null = null;

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

  function matchesQuery(a: AirportRecord, q: string) {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
      (a.iata && a.iata.toLowerCase().includes(needle)) ||
      (a.icao && a.icao.toLowerCase().includes(needle)) ||
      (a.ident && a.ident.toLowerCase().includes(needle)) ||
      (a.name && a.name.toLowerCase().includes(needle)) ||
      (a.city && a.city.toLowerCase().includes(needle))
    );
  }

  $: depOptions = depQuery.trim() ? airports.filter((a) => matchesQuery(a, depQuery)).slice(0, 20) : [];
  $: arrOptions = arrQuery.trim() ? airports.filter((a) => matchesQuery(a, arrQuery)).slice(0, 20) : [];

  $: {
    error = '';
    flightPlan = null;
    samples = [];
    try {
      const depLocal = parseLocal(departureDate, departureTime);
      const arrLocal = parseLocal(arrivalDate, arrivalTime);
      const depZ = toZonedDateTime(depLocal, departureAirport.tz);
      const arrZ = toZonedDateTime(arrLocal, arrivalAirport.tz);
      const plan = createFlightPlan(toAirport(departureAirport), toAirport(arrivalAirport), depZ, arrZ);
      flightPlan = plan;
      samples = sampleFlight(plan, SAMPLE_COUNT);
      routePoints = samples
        .map((s) => {
          const projected = projectEquirectangular(s.location, MAP_WIDTH, MAP_HEIGHT);
          return `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
        })
        .join(' ');
    } catch (e: any) {
      error = e?.message ?? 'Unable to create flight plan';
    }
  }

  $: if (t > 1) t = 1;

  function updateCurrentSample(value: number) {
    if (!samples.length) {
      currentSample = null;
      currentProjected = null;
      return;
    }
    const idx = Math.min(samples.length - 1, Math.round(value * (samples.length - 1)));
    currentSample = samples[idx];
    currentProjected = projectEquirectangular(currentSample.location, MAP_WIDTH, MAP_HEIGHT);
  }

  $: if (samples && samples.length) {
    updateCurrentSample(t);
  }

  $: {
    const timestamp = currentSample?.utcMillis ?? Date.now();
    updateSunGraphics(timestamp);
  }

  function onSliderInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    sliderValue = Number(input.value);
    if (pendingRaf !== null) {
      return;
    }
    pendingRaf = requestAnimationFrame(() => {
      t = sliderValue;
      updateCurrentSample(t);
      pendingRaf = null;
    });
  }

  function onWheel(event: WheelEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const preX = (cx - viewX) / viewScale;
    const preY = (cy - viewY) / viewScale;
    const delta = -event.deltaY * 0.001;
    const newScale = Math.min(4, Math.max(1, viewScale * (1 + delta)));
    viewScale = newScale;
    viewX = cx - preX * viewScale;
    viewY = cy - preY * viewScale;
    clampPan();
  }

  function onPointerDown(event: PointerEvent) {
    event.preventDefault();
    isPanning = true;
    panStart = { x: event.clientX - viewX, y: event.clientY - viewY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!isPanning || !panStart) return;
    viewX = event.clientX - panStart.x;
    viewY = event.clientY - panStart.y;
    clampPan();
  }

  function onPointerUp(event?: PointerEvent) {
    isPanning = false;
    panStart = null;
    if (event) {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }
  }

  function clampPan() {
    const minX = -MAP_WIDTH * (viewScale - 1);
    const minY = -MAP_HEIGHT * (viewScale - 1);
    viewX = Math.min(0, Math.max(minX, viewX));
    viewY = Math.min(0, Math.max(minY, viewY));
  }

  const airportLabel = (a: AirportRecord) => `${a.iata ?? a.icao ?? a.ident} — ${a.name}`;
  const airportCode = (a: AirportRecord) => a.iata ?? a.icao ?? a.ident;

  function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) {
    if (polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function toPath(points: Array<{ x: number; y: number }>) {
    if (!points.length) return '';
    const [first, ...rest] = points;
    const body = rest.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${body} Z`;
  }

  function unwrapProjected(points: Array<{ x: number; y: number }>) {
    if (!points.length) return points;
    const unwrapped: Array<{ x: number; y: number }> = [{ ...points[0] }];
    for (let i = 1; i < points.length; i += 1) {
      const prev = unwrapped[i - 1];
      let x = points[i].x;
      const dx = x - prev.x;
      if (dx > MAP_WIDTH / 2) x -= MAP_WIDTH;
      if (dx < -MAP_WIDTH / 2) x += MAP_WIDTH;
      unwrapped.push({ x, y: points[i].y });
    }
    return unwrapped;
  }

  function updateSunGraphics(timestamp: number) {
    const subsolar = getSubsolarPoint(timestamp);
    sunProjected = projectEquirectangular(subsolar, MAP_WIDTH, MAP_HEIGHT);

    const circle = sampleTerminatorCircle(subsolar, 361);
    const projected = circle.map((p) => projectEquirectangular(p, MAP_WIDTH, MAP_HEIGHT));
    const unwrapped = unwrapProjected(projected);
    terminatorPoints = unwrapped.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    if (!unwrapped.length) {
      dayPath = '';
      nightPath = '';
      return;
    }

    const circlePath = toPath(unwrapped);
    const rect = `M 0 0 L ${MAP_WIDTH} 0 L ${MAP_WIDTH} ${MAP_HEIGHT} L 0 ${MAP_HEIGHT} Z`;
    const sunInside = sunProjected ? pointInPolygon(sunProjected, unwrapped) : true;

    if (sunInside) {
      dayPath = circlePath;
      nightPath = `${rect} ${circlePath}`;
    } else {
      nightPath = circlePath;
      dayPath = `${rect} ${circlePath}`;
    }
  }
</script>

<main class="page">
  <header>
    <div>
      <h1>Sunside</h1>
      <p class="tagline">Flight sunlight visualizer</p>
    </div>
    {#if flightPlan}
      <div class="summary">
        <div>Duration: {flightPlan.durationMinutes} min</div>
        <div>Distance: {(flightPlan.path.distanceMeters / 1000).toFixed(0)} km</div>
      </div>
    {/if}
  </header>

  <section class="panel">
    <h2>Flight setup</h2>
    <div class="grid">
      <label>
        Departure airport
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
      </label>
      <label>
        Departure local date/time
        <div class="row">
          <input type="date" bind:value={departureDate} />
          <input type="time" bind:value={departureTime} />
        </div>
      </label>
      <label>
        Arrival airport
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
      </label>
      <label>
        Arrival local date/time
        <div class="row">
          <input type="date" bind:value={arrivalDate} />
          <input type="time" bind:value={arrivalTime} />
        </div>
      </label>
    </div>
    {#if error}
      <p class="error">Error: {error}</p>
    {/if}
  </section>

  <section class="panel">
    <h2>Timeline</h2>
    <input type="range" min="0" max="1" step="0.01" value={t} on:input={onSliderInput} />
    {#if currentSample}
      <div class="timeline-stats">
        <div>t = {currentSample.t.toFixed(2)}</div>
        <div>UTC: {new Date(currentSample.utcMillis).toISOString().replace('.000Z', 'Z')}</div>
        <div>Sun: {currentSample.sun.status}, side: {currentSample.sun.side}</div>
      </div>
    {/if}
  </section>

  <section class="panel">
    <h2>Map</h2>
    <div
      class="map-wrap"
      class:panning={isPanning}
      on:wheel|preventDefault={(e) => onWheel(e)}
      on:pointerdown={(e) => onPointerDown(e)}
      on:pointermove={(e) => onPointerMove(e)}
      on:pointerup={onPointerUp}
      on:pointerleave={onPointerUp}
    >
      <svg viewBox="0 0 1800 900" aria-label="World map">
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
            <path class="night" d={nightPath} fill-rule="evenodd" />
          {/if}
          {#if dayPath}
            <path class="day" d={dayPath} />
          {/if}
          {#if terminatorPoints}
            <polyline class="terminator" points={terminatorPoints} />
          {/if}
          {#if samples.length}
            <polyline class="route" points={routePoints} />
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
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    background: #0c1426;
    color: #e6edf5;
  }
  main.page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
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
  .summary {
    display: flex;
    gap: 16px;
    color: #d4deed;
    font-weight: 600;
  }
  .panel {
    background: #121d31;
    border: 1px solid #24344c;
    border-radius: 12px;
    padding: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: #d4deed;
  }
  select,
  input[type='search'],
  input[type='date'],
  input[type='time'],
  input[type='range'] {
    width: 100%;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid #24344c;
    background: #0d182b;
    color: #e6edf5;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .row input {
    flex: 1;
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
  .timeline-stats {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    color: #d4deed;
  }
  .map-wrap {
    background: #0e1930;
    border-radius: 12px;
    padding: 8px;
    border: 1px solid #24344c;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    cursor: grab;
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
    .row {
      flex-direction: column;
    }
  }
</style>
