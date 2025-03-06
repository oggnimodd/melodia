<script lang="ts">
  import * as Tone from "tone";
  import { parseMidiFile } from "$lib/features/midi";
  import Button from "$lib/components/ui/button/button.svelte";
  import { Input } from "$lib/components/ui/input";
  import Slider from "$lib/components/ui/slider/slider.svelte";
  import IconPlayerPlay from "@tabler/icons-svelte/icons/player-play-filled";
  import IconPlayerPause from "@tabler/icons-svelte/icons/player-pause-filled";
  import IconPlayerResume from "@tabler/icons-svelte/icons/player-track-next-filled";
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { createSalamanderPiano } from "$lib/utils/piano";
  import type { Notes } from "$lib/models/midi";
  import { formatSecondsToTime } from "$lib/utils/time";

  // States
  let midiFile = $state<File | null>(null);
  let midiData = $state<Awaited<ReturnType<typeof parseMidiFile>> | null>(null);
  let allNotes = $state<Notes>([]);
  let pianoSampler = $state<Tone.Sampler | null>(null);

  let isPlaying = $state(false);
  let isPaused = $state(false);

  // We'll work in "musical seconds" (the timeline of the MIDI file)
  let currentTime = $state(0);
  let totalDuration = $state(0);

  // Slider state for seeking
  let isSliding = $state(false);
  let wasPlayingBeforeSlide = $state(false);

  // BPM / Speed states
  let originalBPM = $state(120); // from MIDI header (or fallback)
  let speedPercent = $state(100); // percentage (20-200%)
  let userBPM = $state(120); // current playback BPM

  let tickEventId: number | null = null;

  // Derived display values
  let currentTimeFormatted = $derived(formatSecondsToTime(currentTime));
  let totalDurationFormatted = $derived(formatSecondsToTime(totalDuration));

  // Utility: clamp a value
  function clampBetween(val: number, minVal: number, maxVal: number) {
    return Math.max(minVal, Math.min(maxVal, val));
  }

  // --- Helper functions for time conversion ---
  // Converts a musical time (in seconds based on the MIDI file) into real time.
  function musicalToRealTime(musicalTime: number): number {
    return musicalTime * (originalBPM / userBPM);
  }
  // Converts real time (Tone.Transport.seconds) into musical time.
  function realToMusicalTime(realTime: number): number {
    return realTime * (userBPM / originalBPM);
  }

  // --- File Selection & MIDI Parsing ---
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

  async function processMidiFile() {
    if (!midiFile) return;
    const data = await parseMidiFile(midiFile);
    midiData = data;
    totalDuration = data.totalDuration; // musical duration

    if (data.header?.tempos && data.header.tempos.length > 0) {
      originalBPM = data.header.tempos[0].bpm;
    } else {
      originalBPM = 120;
    }
    speedPercent = 100;
    userBPM = originalBPM;
    Tone.getTransport().bpm.value = userBPM;

    let noteIdCounter = 0;
    const newNotes: Notes = [];
    data.tracks.forEach((track, trackIndex) => {
      track.notes.forEach((note) => {
        newNotes.push({
          id: noteIdCounter++,
          time: note.time, // musical seconds
          duration: note.duration, // musical seconds
          midi: note.midi,
          name: note.name,
          track: trackIndex,
          velocity: note.velocity,
        });
      });
    });
    newNotes.sort((a, b) => a.time - b.time);
    allNotes = newNotes;
  }

  // --- Playback Functionality ---
  async function playMidi() {
    if (!allNotes.length) return;
    isPlaying = true;
    isPaused = false;
    currentTime = 0;

    await Tone.start();
    if (!pianoSampler) {
      pianoSampler = createSalamanderPiano();
    }
    await Tone.loaded();

    const transport = Tone.getTransport();
    transport.cancel(0);
    transport.stop();

    // Schedule notes using conversion from musical to real time
    for (const n of allNotes) {
      const realTime = musicalToRealTime(n.time);
      transport.schedule((time) => {
        const noteVelocity = n.velocity ?? 1;
        const noteDuration = musicalToRealTime(n.duration);
        pianoSampler!.triggerAttackRelease(
          n.name,
          noteDuration,
          time,
          noteVelocity
        );
      }, realTime);
    }

    // Update the time counter using the correct conversion:
    tickEventId = transport.scheduleRepeat(() => {
      currentTime = realToMusicalTime(transport.seconds);
      if (currentTime >= totalDuration) {
        pauseAtEnd();
      }
    }, 1 / 60);

    transport.start();
  }

  // Toggle pause/resume with proper conversion
  function togglePauseResume() {
    if (!isPlaying) return;
    if (!isPaused) {
      Tone.getTransport().pause();
      isPaused = true;
    } else {
      // Convert current musical time to real time offset when resuming.
      const offsetReal = musicalToRealTime(currentTime);
      Tone.getTransport().start(undefined, offsetReal);
      isPaused = false;
    }
  }

  function handlePlayButtonClick() {
    if (!isPlaying || currentTime >= totalDuration) {
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
    currentTime = totalDuration;
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
    currentTime = 0;
    if (tickEventId !== null) {
      transport.clear(tickEventId);
      tickEventId = null;
    }
  }

  // --- Slider Handlers (for seeking) ---
  function handleSliderInput(e: Event) {
    // The slider value is in musical seconds.
    const musicalTime = parseFloat((e.target as HTMLInputElement).value);
    currentTime = musicalTime;

    if (musicalTime >= totalDuration) {
      Tone.getTransport().pause();
      isPlaying = false;
      isPaused = true;
    } else {
      // Convert the musical time to real time and update Tone.Transport's seconds.
      (Tone.getTransport() as any).seconds = musicalToRealTime(musicalTime);
    }
  }

  function handleSliderMouseDown(e: MouseEvent) {
    if (isPlaying && !isPaused) {
      wasPlayingBeforeSlide = true;
      Tone.getTransport().pause();
      isPaused = true;
    }
    isSliding = true;
  }

  function handleSliderMouseUp() {
    if (wasPlayingBeforeSlide) {
      const offsetReal = musicalToRealTime(currentTime);
      Tone.getTransport().start(undefined, offsetReal);
      isPaused = false;
      wasPlayingBeforeSlide = false;
    }
    isSliding = false;
  }

  // --- BPM / Speed Controls ---
  function applySpeed() {
    // Save the current musical position.
    const currentMusicalPosition = currentTime;

    speedPercent = clampBetween(speedPercent, 20, 200);
    userBPM = (originalBPM * speedPercent) / 100;

    // Update the transport BPM.
    Tone.getTransport().bpm.value = userBPM;

    // Adjust the transport's position to maintain the correct musical time.
    if (isPlaying) {
      (Tone.getTransport() as any).seconds = musicalToRealTime(
        currentMusicalPosition
      );
    }
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
    const currentMusicalPosition = currentTime;
    userBPM = originalBPM;
    Tone.getTransport().bpm.value = userBPM;
    if (isPlaying) {
      (Tone.getTransport() as any).seconds = musicalToRealTime(
        currentMusicalPosition
      );
    }
  }

  // --- Lifecycle ---
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
  });
</script>

<div class="mx-auto max-w-5xl px-4 py-8">
  <h1 class="mb-3 text-2xl font-semibold text-white">MIDI Player</h1>
  <Input type="file" accept=".midi,.mid" onchange={handleFileChange} />

  {#if allNotes.length > 0}
    <!-- Playback Controls -->
    <div class="mt-4 flex items-center gap-4">
      <Button
        class={!isPlaying || currentTime >= totalDuration
          ? "bg-green-500 hover:bg-green-600"
          : isPlaying && !isPaused
            ? "bg-yellow-500 hover:bg-yellow-600"
            : "bg-blue-500 hover:bg-blue-600"}
        onclick={handlePlayButtonClick}
      >
        {#if !isPlaying || currentTime >= totalDuration}
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

    <!-- MIDI Info and Slider -->
    {#if midiFile}
      <div class="mt-4 text-white">
        <p>Currently playing: {midiFile.name}</p>
        <p>Tracks: {midiData?.tracks.length || 0}</p>
        <p>Notes: {allNotes.length}</p>
      </div>
      <div class="mt-4 flex w-full items-center gap-4 text-white">
        <span>{currentTimeFormatted}</span>
        <Slider
          value={currentTime}
          max={totalDuration}
          onmousedown={handleSliderMouseDown}
          oninput={handleSliderInput}
          onmouseup={handleSliderMouseUp}
          onchange={handleSliderMouseUp}
        />
        <span>{totalDurationFormatted}</span>
      </div>
    {/if}

    <!-- BPM / Speed Controls -->
    <div class="mt-6 text-white">
      <p class="mb-2 font-semibold">Playback Speed</p>
      <div class="mb-4 flex items-center gap-2">
        <button
          class="rounded bg-gray-600 px-2 py-1 hover:bg-gray-700"
          onclick={() => decrementSpeed(5)}
        >
          -
        </button>
        <input
          type="number"
          class="w-16 rounded bg-gray-800 p-1 text-center"
          min="20"
          max="200"
          bind:value={speedPercent}
          oninput={applySpeed}
        />
        <button
          class="rounded bg-gray-600 px-2 py-1 hover:bg-gray-700"
          onclick={() => incrementSpeed(5)}
        >
          +
        </button>
        <span class="ml-3">{speedPercent}% = {userBPM.toFixed(2)} BPM</span>
      </div>
      <Button class="bg-gray-500 hover:bg-gray-600" onclick={resetSpeed}>
        Reset
      </Button>
    </div>
  {/if}
</div>
