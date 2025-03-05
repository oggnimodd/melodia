<script lang="ts">
  import { dev } from "$app/environment";
  import { onMount, onDestroy } from "svelte";

  interface FpsCounterProps {
    fps: number;
  }

  let { fps }: FpsCounterProps = $props();
  let displayedFps = $state(fps);
  let interval: ReturnType<typeof setInterval> = $state<any>();

  onMount(() => {
    interval = setInterval(() => {
      displayedFps = fps;
    }, 2000);
  });

  onDestroy(() => {
    clearInterval(interval);
  });
</script>

{#if dev}
  <div
    class="pointer-events-none fixed bottom-2 right-2 z-50 rounded bg-gray-800 bg-opacity-75 px-2 py-1 text-sm text-white"
  >
    FPS: {displayedFps.toFixed(1)}
  </div>
{/if}
