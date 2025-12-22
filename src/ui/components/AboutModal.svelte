<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  export let onClose: () => void;

  let closeButtonEl: HTMLButtonElement | null = null;
  let previousBodyOverflow: string | null = null;
  let previouslyFocused: HTMLElement | null = null;

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
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
  });
</script>

<div class="about-backdrop" role="presentation" on:click|self={onClose}>
  <div
    class="panel about-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="about-title"
    aria-describedby="about-desc"
  >
    <header class="about-header">
      <h2 id="about-title">About Sunside</h2>
      <button bind:this={closeButtonEl} type="button" class="btn icon about-close" on:click={onClose} aria-label="Close">
        ×
      </button>
    </header>

    <div class="about-body" id="about-desc">
      <p>
        Sunside helps you decide which side of the plane to sit on by visualizing where the sun is during your flight.
      </p>

      <h3>Quick start</h3>
      <ol>
        <li>Select a departure and arrival airport.</li>
        <li>Enter the local departure time (arrival can be auto-estimated).</li>
        <li>Press Play or drag the timeline to move the aircraft.</li>
        <li>Use the map to explore day, twilight, and night.</li>
      </ol>

      <h3>How to read the map</h3>
      <ul>
        <li><strong>Sun marker</strong>: where it is closest to midday right now.</li>
        <li><strong>Day/night edge</strong>: where it is sunrise or sunset.</li>
        <li><strong>Twilight band</strong>: the transition between day and night.</li>
      </ul>

      <h3>Privacy</h3>
      <p>
        No accounts. No tracking. Everything runs in your browser. 100% open source. No server-side code. A few
        preferences are saved in local storage (pace, units, auto-estimate).
      </p>

      <h3>Credit</h3>
      <p>
        This project is inspired by&nbsp;
        <a href="https://sunflight.org" target="_blank" rel="noreferrer">sunflight.org</a>
        . It is a great reference implementation of “sun side seat” visualization.
      </p>

      <footer class="about-footer">
        <a href="https://github.com/def324/sunside" target="_blank" rel="noreferrer" class="about-action primary">
          <span class="about-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="currentColor" width="18" height="18">
              <path
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
              />
            </svg>
          </span>
          GitHub
        </a>
        <a href="https://github.com/def324/sunside/issues" target="_blank" rel="noreferrer" class="about-action">
          <span class="about-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M12 16h.01M12 12V8m-7 14h14a2 2 0 0 0 2-2V7l-5-5H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2Z"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          Report an issue
        </a>
      </footer>
    </div>
  </div>
</div>

<style>
  .about-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 10, 20, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 50;
  }

  .about-modal {
    width: min(720px, 100%);
    max-height: min(80vh, 720px);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .about-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #24344c;
  }

  .about-header h2 {
    margin: 0;
  }

  .about-close {
    font-size: 22px;
  }

  .about-body {
    overflow: auto;
    padding-right: 2px;
  }

  .about-body h3 {
    margin: 16px 0 8px;
    font-size: 14px;
    letter-spacing: 0.02em;
    color: #cbd5e1;
    text-transform: uppercase;
  }

  .about-body p {
    margin: 10px 0;
    color: #d4deed;
    line-height: 1.5;
  }

  .about-body ol,
  .about-body ul {
    margin: 8px 0 0;
    padding-left: 20px;
    color: #d4deed;
    line-height: 1.5;
  }

  .about-body a {
    color: rgba(79, 209, 255, 0.95);
    text-decoration: none;
  }

  .about-body a:hover {
    text-decoration: underline;
  }

  .about-footer {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid rgba(36, 52, 76, 0.75);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .about-action {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 11px;
    border-radius: 999px;
    border: 1px solid #24344c;
    background: rgba(13, 24, 43, 0.5);
    color: #cbd5e1;
    font-weight: 650;
    text-decoration: none;
  }

  .about-action.primary {
    border-color: rgba(79, 209, 255, 0.35);
    background: rgba(79, 209, 255, 0.12);
    color: #e6edf5;
  }

  .about-action:hover {
    border-color: rgba(79, 209, 255, 0.35);
    text-decoration: none;
  }

  .about-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: inherit;
  }
</style>
