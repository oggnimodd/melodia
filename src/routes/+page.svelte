<script lang="ts">
  import { browser } from "$app/environment";
  import Button from "$lib/components/ui/button/button.svelte";
  import { Input } from "$lib/components/ui/input";
  import { parseMidiFile } from "$lib/midi/parser";
  import { onDestroy, onMount } from "svelte";
  import * as Tone from "tone";

  let midiFile = $state<File | null>(null);
  let midiInfoJson = $state<string | null>(null);
  let midiData: Awaited<ReturnType<typeof parseMidiFile>> | null = null;
  let pianoSampler = $state<Tone.Sampler | null>(null);
  let isPlaying = $state(false);

  const samplerUrls = {
    C4: "C4.mp3",
    "D#4": "Ds4.mp3",
    "F#4": "Fs4.mp3",
    A4: "A4.mp3",
  };

  function createSampler(): Tone.Sampler {
    return new Tone.Sampler({
      urls: samplerUrls,
      release: 1,
      baseUrl: "https://tonejs.github.io/audio/salamander/",
    }).toDestination();
  }

  function getOrCreateSampler(): Tone.Sampler {
    if (!pianoSampler) {
      pianoSampler = createSampler();
    }
    return pianoSampler;
  }

  function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files?.[0]) {
      midiFile = target.files[0];
    }
  }

  async function playMidi() {
    isPlaying = true;
    await Tone.start();
    const sampler = getOrCreateSampler();
    if (!midiData) return;
    await Tone.loaded();

    // Reset transport
    Tone.getTransport().cancel();
    Tone.getTransport().stop();

    midiData.tracks.forEach((track) => {
      track.notes.forEach((note) => {
        Tone.getTransport().schedule((time) => {
          sampler.triggerAttackRelease(note.name, note.duration, time);
        }, note.time);
      });
    });

    Tone.getTransport().start();
  }

  $effect(() => {
    if (midiFile) {
      (async () => {
        midiData = await parseMidiFile(midiFile);
        midiInfoJson = JSON.stringify(midiData, null, 2);
      })();
    }
  });

  const stopMidi = () => {
    isPlaying = false;

    // Cancel all scheduled events
    Tone.getTransport().cancel();

    // Stop the transport
    Tone.getTransport().stop();

    // Stop all active notes on the sampler
    if (pianoSampler) {
      pianoSampler.releaseAll();
    }
  };

  onMount(() => {
    // Preload sampler for a smoother user experience
    getOrCreateSampler();
  });

  onDestroy(() => {
    if (!browser) return;
    if (pianoSampler) {
      pianoSampler.dispose();
    }
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    isPlaying = false;
  });
</script>

<div class="mx-auto max-w-3xl px-4 py-8">
  <h1 class="mb-3 text-2xl font-semibold">Melodia</h1>
  <Input type="file" accept=".midi,.mid" onchange={handleFileChange} />
  {#if midiFile}
    <div class="mt-4 flex items-center gap-x-3">
      <Button disabled={isPlaying} onclick={playMidi}>Play MIDI</Button>
      <Button disabled={!isPlaying} onclick={stopMidi}>Stop</Button>
    </div>
  {/if}
</div>
