<script lang="ts">
  const mapAssetHref = `${import.meta.env.BASE_URL}map.svg`;

  export let mapWrapEl: HTMLDivElement | null = null;
  export let mapSvgEl: SVGSVGElement | null = null;

  export let mapWidth: number;
  export let mapHeight: number;
  export let viewX: number;
  export let viewY: number;
  export let viewScale: number;
  export let isPanning: boolean;

  export let onWheel: (event: WheelEvent) => void;
  export let onPointerDown: (event: PointerEvent) => void;
  export let onPointerMove: (event: PointerEvent) => void;
  export let onPointerUp: (event?: PointerEvent) => void;
  export let zoomFromButtons: (direction: 'in' | 'out') => void;

  export let nightPath: string;
  export let twilightPath: string;
  export let dayPath: string;
  export let terminatorPath: string;
  export let routeSegments: string[];
  export let currentProjected: { x: number; y: number } | null;
  export let sunProjected: { x: number; y: number } | null;
</script>

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
    <svg bind:this={mapSvgEl} viewBox={`0 0 ${mapWidth} ${mapHeight}`} aria-label="World map">
      <defs>
        <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffd166" stop-opacity="0.5" />
          <stop offset="50%" stop-color="#ffd166" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#ffd166" stop-opacity="0" />
        </radialGradient>
        <clipPath id="map-clip">
          <rect x="0" y="0" width={mapWidth} height={mapHeight} />
        </clipPath>
      </defs>
      <g transform={`translate(${viewX} ${viewY}) scale(${viewScale})`} clip-path="url(#map-clip)">
        <image href={mapAssetHref} x="0" y="0" width={mapWidth} height={mapHeight} />
        {#if nightPath}
          <path class="night" d={nightPath} />
        {/if}
        {#if twilightPath}
          <path class="twilight" d={twilightPath} />
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
