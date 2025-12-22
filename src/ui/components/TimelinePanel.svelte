<script lang="ts">
  import type { FlightPlan } from '../../core/flight';
  import type { AirportRecord, DistanceUnit, PlaybackSpeed, TimelineInfo } from '../types';

  export let timelineInfo: TimelineInfo | null;
  export let flightPlan: FlightPlan | null;
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
