<script lang="ts">
  import type { FlightPlan } from '../../core/flight';
  import type { FlightSunSummary, SunSummaryBucket, SunSummaryUnit } from '../../core/sunSummary';
  import type { AirportRecord, DistanceUnit, PlaybackSpeed, TimelineInfo } from '../types';

  export let timelineInfo: TimelineInfo | null;
  export let flightPlan: FlightPlan | null;
  export let sunSummary: FlightSunSummary | null;
  export let sunSummaryUnit: SunSummaryUnit;
  export let cycleSunSummaryUnit: () => void;
  export let currentSunBucket: SunSummaryBucket | null;
  export let departureAirport: AirportRecord;
  export let arrivalAirport: AirportRecord;
  export let airportCode: (a: AirportRecord) => string;
  export let formatDuration: (mins: number) => string;
  export let formatDistance: (meters: number, unit: DistanceUnit) => string;
  export let cycleDistanceUnit: () => void;
	  export let distanceUnit: DistanceUnit;
	  export let isPlaying: boolean;
	  export let togglePlayback: () => void;
	  export let playSpeed: PlaybackSpeed;
	  export let setPlaySpeed: (speed: PlaybackSpeed) => void;
  export let t: number;
  export let onSliderInput: (event: Event) => void;
  export let formatTime: (ms: number, zone: string) => string;
  export let formatDate: (ms: number, zone: string) => string;

  function formatSummaryValue(unit: SunSummaryUnit, bucket: { millis: number; minutes: number; percent: number }): string {
    if (unit === 'percent') return `${bucket.percent}%`;
    if (bucket.minutes > 0) return formatDuration(bucket.minutes);
    if (bucket.millis > 0) return '<1m';
    return '0m';
  }

  // Calculate stroke-dasharray and dashoffset for CENTERED arc fill
  function arcFillStyle(fraction: number): string {
    const frac = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
    if (frac <= 0) {
      return 'stroke-opacity: 0;';
    }
    const pct = Math.max(1, frac * 100);
    const rounded = Math.round(pct * 10) / 10;
    const gap = Math.round((100 - rounded) * 10) / 10;
    // Offset to center the fill: shift by half the gap
    const offset = -gap / 2;
    return `stroke-dasharray: ${rounded} ${gap}; stroke-dashoffset: ${offset};`;
  }
</script>

<section class="panel timeline-panel">
  <div class="timeline-header">
    <h2>Timeline</h2>
    {#if timelineInfo}
      <div class="timeline-summary">
        <span class="route">{timelineInfo.routeLabel}</span>
        <span class="duration">{formatDuration(flightPlan?.durationMinutes ?? 0)}</span>
        <button type="button" class="distance-toggle" on:click={cycleDistanceUnit} aria-label="Cycle distance units">
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
	        <button type="button" class:active={playSpeed === 1} on:click={() => setPlaySpeed(1)} disabled={!flightPlan}>
	          Slow
	        </button>
	        <button type="button" class:active={playSpeed === 2} on:click={() => setPlaySpeed(2)} disabled={!flightPlan}>
	          Normal
	        </button>
	        <button type="button" class:active={playSpeed === 4} on:click={() => setPlaySpeed(4)} disabled={!flightPlan}>
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
        <div class="endpoint-main">
          {airportCode(departureAirport)} · {formatTime(flightPlan.departureUtc, departureAirport.tz)}
        </div>
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
	      <div class="timeline-card timeline-time-card">
	        <div class="timeline-time-grid">
	          <div class="timeline-time-col">
	            <div class="timeline-time-header">UTC</div>
	            <div class="value">{timelineInfo.utcTime}</div>
	            <div class="timeline-time-date" title={timelineInfo.utcDate}>{timelineInfo.utcDate}</div>
	          </div>
	          <div class="timeline-time-col">
	            <div class="timeline-time-header">Local (UTC{timelineInfo.localOffset})</div>
	            <div class="value">{timelineInfo.localTime}</div>
	            <div class="timeline-time-date" title={timelineInfo.localDate}>{timelineInfo.localDate}</div>
	          </div>
	        </div>
	      </div>

      <div class="timeline-card sunlight-card">
        {#if sunSummary}
          <div class="sunlight-layout">
            <button
              type="button"
              class="sunlight-positions"
              on:click={cycleSunSummaryUnit}
              aria-label="Sun position summary, click to toggle units"
            >
              {#if sunSummary.buckets.left.percent > 0}
                <span class="sun-token seg-left" class:active={currentSunBucket === 'left'}>
                  <span class="sun-dot" aria-hidden="true"></span>
                  Left <span class="sun-token-value">{formatSummaryValue(sunSummaryUnit, sunSummary.buckets.left)}</span>
                </span>
              {/if}
              {#if sunSummary.buckets.right.percent > 0}
                <span class="sun-token seg-right" class:active={currentSunBucket === 'right'}>
                  <span class="sun-dot" aria-hidden="true"></span>
                  Right <span class="sun-token-value">{formatSummaryValue(sunSummaryUnit, sunSummary.buckets.right)}</span>
                </span>
              {/if}
              {#if sunSummary.buckets.ahead.percent > 0}
                <span class="sun-token seg-ahead" class:active={currentSunBucket === 'ahead'}>
                  <span class="sun-dot" aria-hidden="true"></span>
                  Ahead <span class="sun-token-value">{formatSummaryValue(sunSummaryUnit, sunSummary.buckets.ahead)}</span>
                </span>
              {/if}
              {#if sunSummary.buckets.behind.percent > 0}
                <span class="sun-token seg-behind" class:active={currentSunBucket === 'behind'}>
                  <span class="sun-dot" aria-hidden="true"></span>
                  Behind <span class="sun-token-value">{formatSummaryValue(sunSummaryUnit, sunSummary.buckets.behind)}</span>
                </span>
              {/if}
            </button>

            <div class="sunlight-status">
              <div
                class="sun-rose"
                class:status-day={timelineInfo.status === 'day'}
                class:status-twilight={timelineInfo.status === 'twilight'}
                class:status-night={timelineInfo.status === 'night'}
                aria-hidden="true"
              >
                <svg class="sun-rose-svg" viewBox="0 0 100 100" overflow="visible">
                  <defs>
                    <filter
                      id="sun-rose-glow"
                      filterUnits="userSpaceOnUse"
                      primitiveUnits="userSpaceOnUse"
                      x="-80"
                      y="-80"
                      width="260"
                      height="260"
                      color-interpolation-filters="sRGB"
                    >
                      <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur1" />
                      <feComponentTransfer in="blur1" result="glow1">
                        <feFuncA type="linear" slope="1.6" />
                      </feComponentTransfer>
                      <feGaussianBlur in="SourceGraphic" stdDeviation="4.8" result="blur2" />
                      <feComponentTransfer in="blur2" result="glow2">
                        <feFuncA type="linear" slope="1" />
                      </feComponentTransfer>
                      <feGaussianBlur in="SourceGraphic" stdDeviation="10.5" result="blur3" />
                      <feComponentTransfer in="blur3" result="glow3">
                        <feFuncA type="linear" slope="0.6" />
                      </feComponentTransfer>
                      <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blur4" />
                      <feComponentTransfer in="blur4" result="glow4">
                        <feFuncA type="linear" slope="0.35" />
                      </feComponentTransfer>
                      <feMerge>
                        <feMergeNode in="glow4" />
                        <feMergeNode in="glow3" />
                        <feMergeNode in="glow2" />
                        <feMergeNode in="glow1" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  <!-- Left arc -->
                  <path
                    class="sun-rose-track seg-left"
                    class:empty={sunSummary.buckets.left.millis <= 0}
                    d="M 16 65 A 36 36 0 0 1 16 35"
                    pathLength="100"
                  />
                  <path
                    class="sun-rose-arc seg-left"
                    class:active={currentSunBucket === 'left'}
                    class:empty={sunSummary.buckets.left.millis <= 0}
                    filter={currentSunBucket === 'left' ? 'url(#sun-rose-glow)' : undefined}
                    d="M 16 65 A 36 36 0 0 1 16 35"
                    pathLength="100"
                    style={arcFillStyle(sunSummary.buckets.left.fraction)}
                  />

                  <!-- Right arc -->
                  <path
                    class="sun-rose-track seg-right"
                    class:empty={sunSummary.buckets.right.millis <= 0}
                    d="M 84 35 A 36 36 0 0 1 84 65"
                    pathLength="100"
                  />
                  <path
                    class="sun-rose-arc seg-right"
                    class:active={currentSunBucket === 'right'}
                    class:empty={sunSummary.buckets.right.millis <= 0}
                    filter={currentSunBucket === 'right' ? 'url(#sun-rose-glow)' : undefined}
                    d="M 84 35 A 36 36 0 0 1 84 65"
                    pathLength="100"
                    style={arcFillStyle(sunSummary.buckets.right.fraction)}
                  />

                  <!-- Ahead arc -->
                  <path
                    class="sun-rose-track seg-ahead"
                    class:empty={sunSummary.buckets.ahead.millis <= 0}
                    d="M 35 16 A 36 36 0 0 1 65 16"
                    pathLength="100"
                  />
                  <path
                    class="sun-rose-arc seg-ahead"
                    class:active={currentSunBucket === 'ahead'}
                    class:empty={sunSummary.buckets.ahead.millis <= 0}
                    filter={currentSunBucket === 'ahead' ? 'url(#sun-rose-glow)' : undefined}
                    d="M 35 16 A 36 36 0 0 1 65 16"
                    pathLength="100"
                    style={arcFillStyle(sunSummary.buckets.ahead.fraction)}
                  />

                  <!-- Behind arc -->
                  <path
                    class="sun-rose-track seg-behind"
                    class:empty={sunSummary.buckets.behind.millis <= 0}
                    d="M 65 84 A 36 36 0 0 1 35 84"
                    pathLength="100"
                  />
                  <path
                    class="sun-rose-arc seg-behind"
                    class:active={currentSunBucket === 'behind'}
                    class:empty={sunSummary.buckets.behind.millis <= 0}
                    filter={currentSunBucket === 'behind' ? 'url(#sun-rose-glow)' : undefined}
                    d="M 65 84 A 36 36 0 0 1 35 84"
                    pathLength="100"
                    style={arcFillStyle(sunSummary.buckets.behind.fraction)}
                  />

                  <!-- Airplane silhouette -->
                  <g class="sun-rose-plane" aria-hidden="true">
                    <path d="
                      M 50 31
                      C 54 31 54 35 54 38
                      L 54 44
                      L 67 52
                      L 67 55
                      L 54 50
                      L 54 61
                      L 60 67
                      L 60 70
                      L 50 65
                      L 40 70
                      L 40 67
                      L 46 61
                      L 46 50
                      L 33 55
                      L 33 52
                      L 46 44
                      L 46 38
                      C 46 35 46 31 50 31
                      Z
                    " />
                  </g>
                </svg>
              </div>
            </div>

            <button
              type="button"
              class="sunlight-daylight"
              on:click={cycleSunSummaryUnit}
              aria-label="Daylight summary, click to toggle units"
            >
              {#if sunSummary.daylight.buckets.day.percent > 0}
                <span class="sun-token seg-day" class:active={timelineInfo.status === 'day'}>
                  <span class="sun-token-value">{formatSummaryValue(sunSummaryUnit, sunSummary.daylight.buckets.day)}</span>
                  Day <span class="sun-dot" aria-hidden="true"></span>
                </span>
              {/if}
              {#if sunSummary.daylight.buckets.twilight.percent > 0}
                <span class="sun-token seg-twilight" class:active={timelineInfo.status === 'twilight'}>
                  <span class="sun-token-value">{formatSummaryValue(sunSummaryUnit, sunSummary.daylight.buckets.twilight)}</span>
                  Twilight <span class="sun-dot" aria-hidden="true"></span>
                </span>
              {/if}
              {#if sunSummary.daylight.buckets.night.percent > 0}
                <span class="sun-token seg-night" class:active={timelineInfo.status === 'night'}>
                  <span class="sun-token-value">{formatSummaryValue(sunSummaryUnit, sunSummary.daylight.buckets.night)}</span>
                  Night <span class="sun-dot" aria-hidden="true"></span>
                </span>
              {/if}
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</section>
