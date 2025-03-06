<script lang="ts">
  import { sampler } from "$lib/features/midi";
  import { createSalamanderPiano } from "$lib/utils/piano";
  import { onDestroy, onMount } from "svelte";
  import * as Tone from "tone";

  onMount(() => {
    const ctx = new Tone.Context({
      latencyHint: "interactive",
      lookAhead: 0,
    });
    Tone.setContext(ctx);
    Tone.immediate();
    (async () => {
      sampler.instrument = createSalamanderPiano();
      await Tone.loaded();
      console.log("Sampler preloaded");
    })();
  });

  onDestroy(() => {
    if (sampler.instrument) sampler.instrument.dispose();
  });
</script>
