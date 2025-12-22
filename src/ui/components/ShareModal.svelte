<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { AirportRecord, PlaybackSpeed } from '../types';
  import { buildShareUrl } from '../urlParams';

  export let onClose: () => void;
  export let departureAirport: AirportRecord;
  export let arrivalAirport: AirportRecord;
  export let departureDate: string;
  export let departureTime: string;
  export let arrivalDate: string;
  export let arrivalTime: string;
  export let airportCode: (a: AirportRecord) => string;
  export let playSpeed: PlaybackSpeed;

  let closeButtonEl: HTMLButtonElement | null = null;
  let urlInputEl: HTMLInputElement | null = null;
  let previousBodyOverflow: string | null = null;
  let previouslyFocused: HTMLElement | null = null;
  let copyStatus: 'idle' | 'copied' | 'failed' = 'idle';
  let copyResetTimeout: ReturnType<typeof setTimeout> | null = null;

  let autoplay = false;
  let autoplaySpeed: PlaybackSpeed = playSpeed;
  let pointerDownOnBackdrop = false;

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }

  function onBackdropPointerDown(event: PointerEvent) {
    pointerDownOnBackdrop = event.target === event.currentTarget;
  }

  function onBackdropClick(event: MouseEvent) {
    const shouldClose = pointerDownOnBackdrop && event.target === event.currentTarget;
    pointerDownOnBackdrop = false;
    if (shouldClose) onClose();
  }

  function baseUrl(): string {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${window.location.pathname}`;
  }

  let shareUrl = '';
  $: {
    const base = baseUrl();
    if (!base) {
      shareUrl = '';
    } else {
      shareUrl = buildShareUrl(base, {
        from: airportCode(departureAirport),
        to: airportCode(arrivalAirport),
        depart: `${departureDate}T${departureTime}`,
        arrive: `${arrivalDate}T${arrivalTime}`,
        autoplay,
        autoplaySpeed: autoplay ? autoplaySpeed : null
      });
    }
  }

  function selectUrl() {
    urlInputEl?.focus();
    urlInputEl?.select();
  }

  async function copyUrl() {
    if (!shareUrl) return;
    let ok = false;

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        ok = true;
      } catch {}
    }

    if (!ok) {
      selectUrl();
      try {
        ok = document.execCommand?.('copy') ?? false;
      } catch {}
    }

    copyStatus = ok ? 'copied' : 'failed';
    if (copyResetTimeout) clearTimeout(copyResetTimeout);
    copyResetTimeout = setTimeout(() => {
      copyStatus = 'idle';
      copyResetTimeout = null;
    }, 1200);
  }

  onMount(() => {
    previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonEl?.focus();
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    if (previousBodyOverflow !== null) document.body.style.overflow = previousBodyOverflow;
    previouslyFocused?.focus?.();
    if (copyResetTimeout) clearTimeout(copyResetTimeout);
  });
</script>

<div
  class="share-backdrop"
  role="presentation"
  on:pointerdown={onBackdropPointerDown}
  on:click={onBackdropClick}
>
  <div class="panel share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
    <header class="share-header">
      <h2 id="share-title">Share flight</h2>
      <button bind:this={closeButtonEl} type="button" class="btn icon share-close" on:click={onClose} aria-label="Close">
        ×
      </button>
    </header>

    <div class="share-body">
      <div class="share-link">
        <label class="share-label" for="share-url">Link</label>
        <div class="share-link-row">
          <input
            id="share-url"
            bind:this={urlInputEl}
            type="text"
            class="share-url"
            readonly
            value={shareUrl}
            on:focus={selectUrl}
            on:click={selectUrl}
            spellcheck="false"
            aria-label="Shareable link"
          />
          <button type="button" class="btn primary share-copy" on:click={copyUrl} disabled={!shareUrl}>
            {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy'}
          </button>
        </div>
      </div>

      <div class="share-options">
        <div class="pace-control" role="group" aria-label="Autoplay">
          <span class="pace-label">Autoplay</span>
          <div class="segmented">
            <button type="button" class:active={!autoplay} on:click={() => (autoplay = false)}>Off</button>
            <button type="button" class:active={autoplay} on:click={() => (autoplay = true)}>On</button>
          </div>
        </div>

        {#if autoplay}
          <div class="pace-control" role="group" aria-label="Autoplay pace">
            <span class="pace-label">Pace</span>
            <div class="segmented">
              <button type="button" class:active={autoplaySpeed === 1} on:click={() => (autoplaySpeed = 1)}>Slow</button>
              <button type="button" class:active={autoplaySpeed === 2} on:click={() => (autoplaySpeed = 2)}>Medium</button>
              <button type="button" class:active={autoplaySpeed === 4} on:click={() => (autoplaySpeed = 4)}>Fast</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .share-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 10, 20, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 50;
  }

  .share-modal {
    width: min(720px, 100%);
    max-height: min(70vh, 520px);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .share-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #24344c;
  }

  .share-header h2 {
    margin: 0;
  }

  .share-close {
    font-size: 22px;
  }

  .share-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .share-label {
    display: inline-block;
    margin: 0 0 6px;
    font-size: 12px;
    color: #9fb0c7;
  }

  .share-link-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .share-url {
    flex: 1;
    min-width: 0;
    border-radius: 10px;
    border: 1px solid #24344c;
    background: rgba(13, 24, 43, 0.8);
    color: #e6edf5;
    padding: 10px 12px;
    font: inherit;
    font-size: 13px;
  }

  .share-url:focus {
    outline: none;
    border-color: rgba(79, 209, 255, 0.35);
    box-shadow: 0 0 0 3px rgba(79, 209, 255, 0.12);
  }

  .share-copy {
    border-radius: 999px;
    padding: 9px 14px;
    min-width: 98px;
  }

  .share-options {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }

  @media (max-width: 520px) {
    .share-link-row {
      flex-direction: column;
      align-items: stretch;
    }

    .share-copy {
      width: 100%;
    }
  }
</style>
