<script lang="ts">
  import * as Tone from "tone";
  import { parseMidiFile } from "$lib/features/midi";
  import { Input } from "$lib/components/ui/input";
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import { formatSecondsToTime } from "$lib/utils/time";
  import useFullScreen from "$lib/hooks/useFullscreen.svelte";
  import type { Notes } from "$lib/models/midi";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import PlaybackControls from "$lib/components/PlaybackControls.svelte";
  import { useResizeObserver } from "$lib/hooks/useResizeObserver.svelte";
  import FpsCounter from "$lib/components/FpsCounter.svelte";
  import { PianoRoll } from "$lib/features/piano-roll";
  import { CONFIG, createSalamanderPiano } from "$lib/utils/piano";
  import type { MidiData } from "$lib/models/midi";
  import { autoSaveMidi } from "$lib/features/midi/storage";
  import { toast } from "svelte-sonner";
  import { selectedMidi } from "$lib/features/midi";

  // TODO: extract the file handler
  let autoSaveEnabled = $state(true);

  let containerDiv = $state<HTMLDivElement | null>(null);
  let controlsDiv = $state<HTMLDivElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);

  // Playback & MIDI states
  let midiData = $state<MidiData | null>(null);
  let allNotes: Notes = $state([]);
  let isPlaying = $state(false);
  let isPaused = $state(false);
  let currentTime = $state(0);
  let animationFrameId = $state<number | null>(null);
  let fps = $state(0);
  let lastFrameTimestamp = $state<number | null>(null);

  // BPM / speed state
  let originalBPM = $state(120);
  let speedPercent = $state(100);
  let userBPM = $state(120);

  function musicalToRealTime(musicalTime: number): number {
    return musicalTime * (originalBPM / userBPM);
  }
  function realToMusicalTime(realTime: number): number {
    return realTime * (userBPM / originalBPM);
  }
  function clampBetween(val: number, minVal: number, maxVal: number): number {
    return Math.max(minVal, Math.min(maxVal, val));
  }
  function applySpeed(newSpeed: number) {
    speedPercent = clampBetween(newSpeed, 20, 200);
    userBPM = (originalBPM * speedPercent) / 100;
    Tone.getTransport().bpm.value = userBPM;
    if (isPlaying) {
      (Tone.getTransport() as any).seconds = musicalToRealTime(currentTime);
      audioStartTime = Tone.getContext().now() - musicalToRealTime(currentTime);
    }
  }
  function incrementSpeed(step = 5) {
    applySpeed(speedPercent + step);
  }
  function decrementSpeed(step = 5) {
    applySpeed(speedPercent - step);
  }
  function resetSpeed() {
    speedPercent = 100;
    applySpeed(100);
  }

  // Misc state
  let showModal = $state(false);
  let currentTimeFormatted = $derived(formatSecondsToTime(currentTime));
  let totalDuration = $derived(midiData?.totalDuration || 0);
  let totalDurationFormatted = $derived(formatSecondsToTime(totalDuration));

  // Pointer interactions state
  let startY = $state<number | null>(null);
  let startX = $state<number | null>(null);
  let lastY = $state<number | null>(null);
  let isSwiping = $state(false);
  let swipeThreshold = 15;
  let wasPlayingBeforeInteraction = $state(false);
  let activePointerId: number | null = $state(null);
  let swipeFactor = $state(1);

  // Audio variables
  let audioStartTime = 0;
  let pianoSampler = $state<Tone.Sampler | null>(null);

  // Fullscreen hook
  let { fullscreen, toggle: toggleFullscreen } = useFullScreen();

  // PianoRoll instance (initialized in onMount)
  let pianoRoll = $state(
    new PianoRoll({
      minMidi: 24,
      maxMidi: 108,
    })
  );

  function drawPianoRoll() {
    if (pianoRoll) pianoRoll.drawAll(currentTime);
  }

  function animate() {
    if (!isPlaying || !pianoRoll) return;
    const nowPerf = performance.now();
    if (lastFrameTimestamp !== null) {
      const delta = nowPerf - lastFrameTimestamp;
      fps = 1000 / delta;
    }
    lastFrameTimestamp = nowPerf;
    const nowAudio = Tone.getContext().now();
    const elapsedReal = nowAudio - audioStartTime;
    const newMusicalTime = realToMusicalTime(elapsedReal);
    currentTime += (newMusicalTime - currentTime) * 0.11;
    if (currentTime >= totalDuration) {
      pauseAtEnd();
      return;
    }
    pianoRoll.updateActiveNotes(currentTime, allNotes);
    drawPianoRoll();
    animationFrameId = requestAnimationFrame(animate);
  }

  async function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      if (isPlaying) haltPlayback();
      pianoRoll.clearCache();
      midiData = null;
      allNotes = [];
      selectedMidi.file = input.files[0];

      try {
        const data = await parseMidiFile(selectedMidi.file);

        if (autoSaveEnabled) {
          try {
            await autoSaveMidi(selectedMidi.file, data);
          } catch (error) {
            toast.error("Failed to auto-save MIDI file.");
          }
        }

        midiData = data;
        let noteIdCounter = 0;
        const newNotes: Notes = [];
        data.tracks.forEach((track, trackIndex) => {
          track.notes.forEach((note) => {
            newNotes.push({
              id: noteIdCounter++,
              time: note.time,
              duration: note.duration,
              midi: note.midi,
              name: note.name,
              track: trackIndex,
              velocity: note.velocity,
            });
          });
        });
        newNotes.sort((a, b) => a.time - b.time);
        allNotes = newNotes;
        if (allNotes.length > 0) {
          pianoRoll.allNotes = allNotes;
          // Reinitialize canvas with updated note ranges.
          pianoRoll.initCanvas({
            fullscreen: fullscreen.isActive,
            controlsDiv,
          });
        }
        originalBPM =
          data.header?.tempos && data.header.tempos.length > 0
            ? data.header.tempos[0].bpm
            : 120;
        speedPercent = 100;
        userBPM = originalBPM;
        Tone.getTransport().bpm.value = userBPM;
        drawPianoRoll();
      } catch (error) {
        toast.error("Failed to parse MIDI file.");
      }
    }
  }

  function handleCloseModal() {
    showModal = false;
  }

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
    for (const n of allNotes) {
      const realTime = musicalToRealTime(n.time);
      transport.schedule((time) => {
        const noteDuration = musicalToRealTime(n.duration);
        pianoSampler!.triggerAttackRelease(
          n.name,
          noteDuration,
          time,
          n.velocity ?? 1
        );
      }, realTime);
    }
    transport.start();
    audioStartTime = Tone.getContext().now() - musicalToRealTime(currentTime);
    requestAnimationFrame(animate);
  }

  function togglePauseResume() {
    if (!isPlaying) return;
    if (!isPaused) {
      Tone.getTransport().pause();
      isPaused = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    } else {
      audioStartTime = Tone.getContext().now() - musicalToRealTime(currentTime);
      Tone.getTransport().start(undefined, musicalToRealTime(currentTime));
      isPaused = false;
      requestAnimationFrame(animate);
    }
  }

  function handlePlayButtonClick() {
    if (!isPlaying || currentTime >= totalDuration) {
      playMidi();
    } else {
      togglePauseResume();
    }
  }

  function seekBackward() {
    let newTime = currentTime - 5;
    if (newTime < 0) newTime = 0;
    currentTime = newTime;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (isPlaying && !isPaused) {
      Tone.getTransport().pause();
      Tone.getTransport().start(undefined, musicalToRealTime(newTime));
      audioStartTime = Tone.getContext().now() - musicalToRealTime(currentTime);
      requestAnimationFrame(animate);
    } else {
      (Tone.getTransport() as any).seconds = musicalToRealTime(newTime);
      drawPianoRoll();
    }
  }

  function seekForward() {
    let newTime = currentTime + 5;
    if (newTime > totalDuration) newTime = totalDuration;
    currentTime = newTime;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (isPlaying && !isPaused) {
      Tone.getTransport().pause();
      Tone.getTransport().start(undefined, musicalToRealTime(newTime));
      audioStartTime = Tone.getContext().now() - musicalToRealTime(currentTime);
      requestAnimationFrame(animate);
    } else {
      (Tone.getTransport() as any).seconds = musicalToRealTime(newTime);
      drawPianoRoll();
    }
  }

  let isSliding = $state(false);
  let wasPlayingBeforeSlide = $state(false);
  function handleSliderPointerDown(e: PointerEvent) {
    if (isPlaying && !isPaused) {
      wasPlayingBeforeSlide = true;
      Tone.getTransport().pause();
      isPaused = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    }
    isSliding = true;
  }
  function handleSliderInput(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    currentTime = val;
    pianoRoll.updateActiveNotes(currentTime, allNotes);
    drawPianoRoll();
    if (val >= totalDuration) {
      Tone.getTransport().pause();
      isPlaying = false;
      isPaused = true;
    } else {
      (Tone.getTransport() as any).seconds = musicalToRealTime(val);
    }
  }
  function handleSliderPointerUp() {
    if (wasPlayingBeforeSlide) {
      const val = currentTime;
      Tone.getTransport().start(undefined, musicalToRealTime(val));
      audioStartTime = Tone.getContext().now() - musicalToRealTime(currentTime);
      isPaused = false;
      requestAnimationFrame(animate);
      wasPlayingBeforeSlide = false;
    }
    pianoRoll.updateActiveNotes(currentTime, allNotes);
    drawPianoRoll();
    isSliding = false;
  }

  // Pointer handlers for canvas swiping
  function handleCanvasPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastY = e.clientY;
    isSwiping = false;
    wasPlayingBeforeInteraction = isPlaying && !isPaused;
    if (isPlaying && !isPaused) {
      Tone.getTransport().pause();
      isPaused = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    }
    if (canvas) canvas.setPointerCapture(e.pointerId);
  }
  function handleCanvasPointerMove(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return;
    if (startY === null) return;
    const deltaY = e.clientY - startY;
    if (!isSwiping && Math.abs(deltaY) > swipeThreshold) {
      isSwiping = true;
      updateSwipeFactor();
    }
    if (isSwiping) {
      const yDiff = lastY !== null ? e.clientY - lastY : 0;
      const timeAdjustment = yDiff * swipeFactor;
      currentTime = Math.max(
        0,
        Math.min(totalDuration, currentTime + timeAdjustment)
      );
      pianoRoll.updateActiveNotes(currentTime, allNotes);
      (Tone.getTransport() as any).seconds = musicalToRealTime(currentTime);
      drawPianoRoll();
      lastY = e.clientY;
    }
  }
  function handleCanvasPointerUp(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerId !== activePointerId) return;
    if (startY === null) return;
    const deltaY = Math.abs(e.clientY - startY);
    if (deltaY < swipeThreshold) {
      if (!isPlaying) {
        playMidi();
      } else if (isPaused && !wasPlayingBeforeInteraction) {
        togglePauseResume();
      } else if (!wasPlayingBeforeInteraction) {
        togglePauseResume();
      }
    } else {
      if (wasPlayingBeforeInteraction) {
        Tone.getTransport().start(undefined, musicalToRealTime(currentTime));
        audioStartTime =
          Tone.getContext().now() - musicalToRealTime(currentTime);
        isPaused = false;
        requestAnimationFrame(animate);
      }
    }
    pianoRoll.updateActiveNotes(currentTime, allNotes);
    drawPianoRoll();
    startX = null;
    startY = null;
    lastY = null;
    isSwiping = false;
    activePointerId = null;
  }

  function pauseAtEnd() {
    Tone.getTransport().pause();
    isPlaying = false;
    isPaused = true;
    currentTime = totalDuration;
    drawPianoRoll();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }
  function haltPlayback() {
    Tone.getTransport().pause();
    isPlaying = false;
    isPaused = true;
    currentTime = 0;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    drawPianoRoll();
  }

  function updateSwipeFactor() {
    if (pianoRoll) {
      const pianoTopY =
        pianoRoll.canvasCssHeight -
        pianoRoll.canvasCssHeight * CONFIG.pianoHeightRatio;
      swipeFactor = pianoRoll.visibleSeconds / pianoTopY;
    }
  }

  useResizeObserver({
    element: () => containerDiv,
    onResize: () => {
      if (pianoRoll) {
        pianoRoll.initCanvas({ fullscreen: fullscreen.isActive, controlsDiv });
        drawPianoRoll();
      }
    },
  });

  onMount(() => {
    if (browser) {
      if (containerDiv && canvas) {
        pianoRoll.setElements({ canvas, containerDiv });
        pianoRoll.initCanvas({ fullscreen: fullscreen.isActive, controlsDiv });
      }
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
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    isPlaying = false;
  });
</script>

<div
  class={fullscreen.isActive
    ? "m-0 flex h-screen w-full flex-col p-0"
    : "mx-auto max-w-5xl px-4 py-8"}
  bind:this={containerDiv}
>
  {#if !fullscreen.isActive}
    <h1 class="mb-3 text-2xl font-semibold text-white">Melodia</h1>
    <Input type="file" accept=".midi,.mid" onchange={handleFileChange} />
  {/if}
  {#if allNotes.length > 0}
    <PlaybackControls
      bind:controlsDiv
      {fullscreen}
      midiFile={selectedMidi.file}
      {isPlaying}
      {isPaused}
      {currentTime}
      {totalDuration}
      {handlePlayButtonClick}
      {seekBackward}
      {seekForward}
      {originalBPM}
      {userBPM}
      {speedPercent}
      {incrementSpeed}
      {decrementSpeed}
      {resetSpeed}
      {applySpeed}
      {toggleFullscreen}
      bind:showModal
      {currentTimeFormatted}
      {totalDurationFormatted}
      {handleSliderPointerDown}
      {handleSliderInput}
      {handleSliderPointerUp}
    />
  {/if}
  <div
    class={fullscreen.isActive
      ? "flex-1 overflow-hidden bg-black"
      : "mt-4 overflow-hidden rounded-lg border border-gray-700 bg-black"}
  >
    <canvas
      bind:this={canvas}
      class="w-full"
      style="touch-action: none;"
      onpointerdown={handleCanvasPointerDown}
      onpointermove={handleCanvasPointerMove}
      onpointerup={handleCanvasPointerUp}
    ></canvas>
  </div>
</div>

<SettingsModal
  {showModal}
  audioVisualOffset={pianoRoll.audioVisualOffset}
  showLabels={pianoRoll.showLabels}
  visibleSeconds={pianoRoll.visibleSeconds}
  showOctaveLines={pianoRoll.showOctaveLines}
  onClose={handleCloseModal}
  onResetOffset={() => {
    pianoRoll.resetAudioVisualOffset();
    drawPianoRoll();
  }}
  setShowLabels={(val) => {
    pianoRoll.setShowLabels(val);
    drawPianoRoll();
  }}
  setAudioVisualOffset={(val) => {
    pianoRoll.setAudioVisualOffset(val);
    drawPianoRoll();
  }}
  setVisibleSeconds={(val) => {
    pianoRoll.setVisibleSeconds(val);
    drawPianoRoll();
  }}
  setShowOctaveLines={(val) => {
    pianoRoll.setShowOctaveLines(val);
    drawPianoRoll();
  }}
/>
<FpsCounter {fps} />
