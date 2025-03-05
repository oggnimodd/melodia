<script lang="ts">
  import { dev } from "$app/environment";

  interface FpsCounterProps {
    fps: number;
  }

  let { fps }: FpsCounterProps = $props();
</script>

{#if dev}
  <div
    class="pointer-events-none fixed bottom-2 right-2 z-50 rounded bg-gray-800 bg-opacity-75 px-2 py-1 text-sm text-white"
  >
    FPS: {fps.toFixed(1)}
  </div>
{/if}
