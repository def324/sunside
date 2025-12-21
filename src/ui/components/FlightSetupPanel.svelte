<script lang="ts">
  import type { AirportRecord } from '../types';

  export let departureAirport: AirportRecord;
  export let arrivalAirport: AirportRecord;
  export let depQuery: string;
  export let arrQuery: string;
  export let showDepList: boolean;
  export let showArrList: boolean;
  export let depOptions: AirportRecord[];
  export let arrOptions: AirportRecord[];
  export let departureDate: string;
  export let departureTime: string;
  export let arrivalDate: string;
  export let arrivalTime: string;
  export let autoEstimateArrival: boolean;
  export let onAutoEstimateArrivalChange: (event: Event) => void;
  export let airportCode: (a: AirportRecord) => string;
  export let airportLabel: (a: AirportRecord) => string;
  export let error: string;
</script>

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

