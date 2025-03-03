<script lang="ts">
  import * as Tone from "tone";
  import { parseMidiFile } from "$lib/midi/parser";
  import Button from "$lib/components/ui/button/button.svelte";
  import { Input } from "$lib/components/ui/input";
  import IconPlayerPlay from "@tabler/icons-svelte/icons/player-play-filled";
  import IconPlayerPause from "@tabler/icons-svelte/icons/player-pause-filled";
  import IconPlayerResume from "@tabler/icons-svelte/icons/player-track-next-filled";
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { createSalamanderPiano } from "$lib/utils/piano";
  import type { Notes } from "$lib/models/midi";

  // states
  let midiFile = $state<File | null>(null);
  let midiData = $state<Awaited<ReturnType<typeof parseMidiFile>> | null>(null);
  let allNotes = $state<Notes>([]);
  let pianoSampler = $state<Tone.Sampler | null>(null);

  let isPlaying = $state(false);
  let isPaused = $state(false);

  let currentTick = $state(0);
  let totalDuration = $state(0);
  let totalTicks = $state(0);
  let tickEventId: number | null = null;

  // BPM / Speed states
  let originalBPM = $state(120); // fallback if no tempo is found
  let speedPercent = $state(100); // default 100%
  let userBPM = $state(120); // current BPM for the transport

  // file selection
  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      if (isPlaying) haltPlayback();
      midiData = null;
      allNotes = [];
      midiFile = input.files[0];
      processMidiFile();
    }
  }

  // parse the MIDI file and gather notes
  async function processMidiFile() {
    if (!midiFile) return;
    const data = await parseMidiFile(midiFile);
    midiData = data;
    totalDuration = data.totalDuration;

    // pick up the first tempo from the MIDI if it exists
    if (data.header?.tempos && data.header.tempos.length > 0) {
      originalBPM = data.header.tempos[0].bpm;
    } else {
      originalBPM = 120; // fallback
    }
    // reset speed states to default
    speedPercent = 100;
    userBPM = originalBPM;
    Tone.getTransport().bpm.value = userBPM;

    // gather notes
    let noteIdCounter = 0;
    const newNotes: Notes = [];
    data.tracks.forEach((track, trackIndex) => {
      track.notes.forEach((note) => {
        newNotes.push({
          id: noteIdCounter++,
          time: note.time, // seconds
          duration: note.duration, // seconds
          midi: note.midi,
          name: note.name,
          track: trackIndex,
        });
      });
    });
    newNotes.sort((a, b) => a.time - b.time);
    allNotes = newNotes;
  }

  // playback
  async function playMidi() {
    if (!allNotes.length) return;
    isPlaying = true;
    isPaused = false;
    currentTick = 0;

    await Tone.start();
    if (!pianoSampler) {
      pianoSampler = createSalamanderPiano();
    }
    await Tone.loaded();

    const transport = Tone.getTransport();
    transport.cancel(0);
    transport.stop();

    // figure out ticks per second for display
    const midiPPQ = midiData?.header?.ppq || transport.PPQ;
    const ticksPerSecond = (transport.bpm.value / 60) * midiPPQ;
    totalTicks = totalDuration * ticksPerSecond;

    // schedule notes by absolute seconds
    for (const n of allNotes) {
      transport.schedule((time) => {
        pianoSampler!.triggerAttackRelease(n.name, n.duration, time);
      }, n.time);
    }

    // update currentTick at ~60 fps
    tickEventId = transport.scheduleRepeat(() => {
      currentTick = transport.seconds * ticksPerSecond;
      if (transport.seconds >= totalDuration) {
        pauseAtEnd();
      }
    }, 1 / 60);

    transport.start();
  }

  function togglePauseResume() {
    if (!isPlaying) return;
    const transport = Tone.getTransport();
    const ticksPerSecond = (transport.bpm.value / 60) * transport.PPQ;
    if (!isPaused) {
      transport.pause();
      isPaused = true;
    } else {
      const offsetSeconds = currentTick / ticksPerSecond;
      transport.start(undefined, offsetSeconds);
      isPaused = false;
    }
  }

  function handlePlayButtonClick() {
    if (!isPlaying || currentTick >= totalTicks) {
      playMidi();
    } else {
      togglePauseResume();
    }
  }

  function pauseAtEnd() {
    const transport = Tone.getTransport();
    transport.pause();
    isPlaying = false;
    isPaused = true;
    currentTick = totalTicks;
    if (tickEventId !== null) {
      transport.clear(tickEventId);
      tickEventId = null;
    }
  }

  function haltPlayback() {
    const transport = Tone.getTransport();
    transport.pause();
    isPlaying = false;
    isPaused = true;
    currentTick = 0;
    if (tickEventId !== null) {
      transport.clear(tickEventId);
      tickEventId = null;
    }
  }

  // speed / BPM
  function clampBetween(val: number, minVal: number, maxVal: number) {
    return Math.max(minVal, Math.min(maxVal, val));
  }

  function applySpeed() {
    speedPercent = clampBetween(speedPercent, 20, 200);
    userBPM = (originalBPM * speedPercent) / 100;
    Tone.getTransport().bpm.value = userBPM;
  }

  function incrementSpeed(step = 5) {
    speedPercent = clampBetween(speedPercent + step, 20, 200);
    applySpeed();
  }

  function decrementSpeed(step = 5) {
    speedPercent = clampBetween(speedPercent - step, 20, 200);
    applySpeed();
  }

  function resetSpeed() {
    speedPercent = 100;
    userBPM = originalBPM;
    Tone.getTransport().bpm.value = userBPM;
  }

  onMount(() => {
    if (browser) {
      const ctx = new Tone.Context({
        latencyHint: "interactive",
        lookAhead: 0,
      });
      Tone.setContext(ctx);
      Tone.immediate();

      (async () => {
        pianoSampler = createSalamanderPiano();
        await Tone.loaded();
        console.log("Sampler preloaded");
      })();
    }
  });

  onDestroy(() => {
    if (!browser) return;
    if (pianoSampler) pianoSampler.dispose();
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    isPlaying = false;
  });
</script>

<div class="mx-auto max-w-5xl px-4 py-8">
  <h1 class="mb-3 text-2xl font-semibold text-white">MIDI Player</h1>

  <Input type="file" accept=".midi,.mid" onchange={handleFileChange} />

  {#if allNotes.length > 0}
    <!-- Playback controls -->
    <div class="mt-4 flex items-center gap-4">
      <Button
        class={!isPlaying || currentTick >= totalTicks
          ? "bg-green-500 hover:bg-green-600"
          : isPlaying && !isPaused
            ? "bg-yellow-500 hover:bg-yellow-600"
            : "bg-blue-500 hover:bg-blue-600"}
        onclick={handlePlayButtonClick}
      >
        {#if !isPlaying || currentTick >= totalTicks}
          <IconPlayerPlay />
          <span class="ml-2">Play</span>
        {:else if isPlaying && !isPaused}
          <IconPlayerPause />
          <span class="ml-2">Pause</span>
        {:else}
          <IconPlayerResume />
          <span class="ml-2">Resume</span>
        {/if}
      </Button>
    </div>

    <!-- MIDI info -->
    {#if midiFile}
      <div class="mt-4 text-white">
        <p>Currently playing: {midiFile.name}</p>
        <p>Tracks: {midiData?.tracks.length || 0}</p>
        <p>Notes: {allNotes.length}</p>
        <p>
          Current Tick: {Math.floor(currentTick)} / {Math.floor(totalTicks)}
        </p>
      </div>
    {/if}

    <!-- BPM / Speed controls (20% - 200%) -->
    <div class="mt-6 text-white">
      <p class="mb-2 font-semibold">Playback Speed</p>

      <div class="mb-4 flex items-center gap-2">
        <!-- minus button -->
        <button
          class="rounded bg-gray-600 px-2 py-1 hover:bg-gray-700"
          onclick={() => decrementSpeed(5)}
        >
          -
        </button>

        <!-- numeric input (20 - 200), updates in real time -->
        <input
          type="number"
          class="w-16 rounded bg-gray-800 p-1 text-center"
          min="20"
          max="200"
          bind:value={speedPercent}
          oninput={applySpeed}
        />

        <!-- plus button -->
        <button
          class="rounded bg-gray-600 px-2 py-1 hover:bg-gray-700"
          onclick={() => incrementSpeed(5)}
        >
          +
        </button>

        <!-- show final BPM -->
        <span class="ml-3">{speedPercent}% = {userBPM.toFixed(2)} BPM</span>
      </div>

      <Button class="bg-gray-500 hover:bg-gray-600" onclick={resetSpeed}>
        Reset
      </Button>
    </div>
  {/if}
</div>
