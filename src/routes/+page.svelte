<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { parseMidiFile } from "$lib/midi/parser";

  let midiFile = $state<File | null>(null);
  let midiInfoJson = $state<string | null>(null);

  // Handle file input change
  function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files?.[0]) {
      midiFile = target.files[0];
    }
  }

  // Effect
  $effect(() => {
    if (midiFile) {
      (async () => {
        const midiData = await parseMidiFile(midiFile);
        midiInfoJson = JSON.stringify(midiData, null, 2);
      })();
    }
  });
</script>

<h1>Melodia</h1>

<Input type="file" accept=".midi,.mid" onchange={handleFileChange} />

{#if midiFile}
  <pre>{midiInfoJson}</pre>
{/if}
