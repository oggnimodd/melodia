<script lang="ts">
  import * as Tone from "tone";
  import { parseMidiFile, sampler } from "$lib/features/midi";
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
  import Button from "$lib/components/ui/button/button.svelte";

  let autoSaveEnabled = $state(true);
  let containerDiv = $state<HTMLDivElement | null>(null);
  let controlsDiv = $state<HTMLDivElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);

  let trackNames = $state<string[]>([]);
  let activeTrackIndices = $state(new Set<number>());

  let midiData = $state<MidiData | null>(null);
  let allNotes: Notes = $state([]);
  let isPlaying = $state(false);
  let isPaused = $state(false);
  let currentTime = $state(0);
  let animationFrameId = $state<number | null>(null);
  let fps = $state(0);
  let lastFrameTimestamp = $state<number | null>(null);

  let filteredNotes: Notes = $derived(
    allNotes.filter((note) => activeTrackIndices.has(note.track))
  );

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
    applySpeed(100);
  }

  let showModal = $state(false);
  let currentTimeFormatted = $derived(formatSecondsToTime(currentTime));
  let totalDuration = $derived(midiData?.totalDuration || 0);
  let totalDurationFormatted = $derived(formatSecondsToTime(totalDuration));

  let startY = $state<number | null>(null);
  let startX = $state<number | null>(null);
  let lastY = $state<number | null>(null);
  let isSwiping = $state(false);
  let swipeThreshold = 15;
  let wasPlayingBeforeInteraction = $state(false);
  let activePointerId: number | null = $state(null);
  let swipeFactor = $state(1);
  let audioStartTime = 0;
  let { fullscreen, toggle: toggleFullscreen } = useFullScreen();

  let pianoRoll = $state(
    new PianoRoll({
      minMidi: 24,
      maxMidi: 108,
    })
  );

  function drawPianoRoll() {
    if (pianoRoll) {
      pianoRoll.allNotes = filteredNotes;
      pianoRoll.drawAll(currentTime);
    }
  }

  function animate() {
    if (!isPlaying || !pianoRoll) {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      return;
    }

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

    if (filteredNotes.length > 0) {
      pianoRoll.updateActiveNotes(currentTime, filteredNotes);
      drawPianoRoll();
    } else if (pianoRoll.ctx) {
      pianoRoll.ctx.clearRect(
        0,
        0,
        pianoRoll.canvasCssWidth,
        pianoRoll.canvasCssHeight
      );
      pianoRoll.drawPianoKeys();
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  function processMidiData(data: MidiData) {
    if (isPlaying) haltPlayback();
    pianoRoll.clearCache();
    midiData = data;
    let noteIdCounter = 0;
    const newNotesRaw: Notes = [];

    const newTrackNamesArray: string[] = [];
    const newActiveTrackIndicesSet = new Set<number>();

    data.tracks.forEach((track, trackIndex) => {
      newTrackNamesArray.push(track.name || `Track ${trackIndex + 1}`);
      newActiveTrackIndicesSet.add(trackIndex);
      track.notes.forEach((note) => {
        newNotesRaw.push({
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
    newNotesRaw.sort((a, b) => a.time - b.time);
    allNotes = newNotesRaw;
    trackNames = newTrackNamesArray;
    activeTrackIndices = newActiveTrackIndicesSet;

    if (allNotes.length > 0) {
      pianoRoll.allNotes = allNotes;
      pianoRoll.initCanvas({
        fullscreen: fullscreen.isActive,
        controlsDiv,
      });
    } else {
      pianoRoll.allNotes = [];
      pianoRoll.initCanvas({ fullscreen: fullscreen.isActive, controlsDiv });
    }

    originalBPM =
      data.header?.tempos && data.header.tempos.length > 0
        ? data.header.tempos[0].bpm
        : 120;
    speedPercent = 100;
    userBPM = originalBPM;
    Tone.getTransport().bpm.value = userBPM;
    currentTime = 0;
    drawPianoRoll();
  }

  $effect(() => {
    if (selectedMidi.data) {
      processMidiData(selectedMidi.data);
      selectedMidi.data = null;
      selectedMidi.file = null;
    }
  });

  async function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      if (isPlaying) haltPlayback();
      pianoRoll.clearCache();
      midiData = null;
      allNotes = [];
      trackNames = [];
      activeTrackIndices = new Set();
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
        processMidiData(data);
      } catch (error) {
        midiData = null;
        allNotes = [];
        trackNames = [];
        activeTrackIndices = new Set();
        if (pianoRoll) pianoRoll.allNotes = [];
        toast.error("Failed to parse MIDI file.");
        drawPianoRoll();
      }
    }
  }

  function handleCloseModal() {
    showModal = false;
  }

  async function playMidi() {
    isPlaying = true;
    isPaused = false;

    await Tone.start();
    if (!sampler.instrument) {
      sampler.instrument = createSalamanderPiano();
    }
    await Tone.loaded();
    const transport = Tone.getTransport();
    transport.cancel(0);
    transport.stop();

    for (const n of filteredNotes) {
      const realTime = musicalToRealTime(n.time);
      transport.schedule((time) => {
        const noteDuration = musicalToRealTime(n.duration);
        sampler.instrument!.triggerAttackRelease(
          n.name,
          noteDuration,
          time,
          n.velocity ?? 1
        );
      }, realTime);
    }

    if (currentTime >= totalDuration && totalDuration > 0) {
      currentTime = 0;
    }

    transport.start(undefined, musicalToRealTime(currentTime));
    audioStartTime = Tone.getContext().now() - musicalToRealTime(currentTime);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(animate);
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
      if (!animationFrameId) animationFrameId = requestAnimationFrame(animate);
    }
  }

  function handlePlayButtonClick() {
    if (!isPlaying || (currentTime >= totalDuration && totalDuration > 0)) {
      playMidi();
    } else {
      togglePauseResume();
    }
  }

  function toggleTrack(trackIndex: number) {
    const newActiveTrackIndices = new Set(activeTrackIndices);
    if (newActiveTrackIndices.has(trackIndex)) {
      newActiveTrackIndices.delete(trackIndex);
    } else {
      newActiveTrackIndices.add(trackIndex);
    }
    activeTrackIndices = newActiveTrackIndices;

    drawPianoRoll();

    if (isPlaying) {
      const wasPaused = isPaused;
      if (!wasPaused) {
        Tone.getTransport().pause();
      }

      Tone.getTransport().cancel(0);

      for (const n of filteredNotes) {
        const realTime = musicalToRealTime(n.time);
        Tone.getTransport().schedule((time) => {
          const noteDuration = musicalToRealTime(n.duration);
          sampler.instrument!.triggerAttackRelease(
            n.name,
            noteDuration,
            time,
            n.velocity ?? 1
          );
        }, realTime);
      }

      (Tone.getTransport() as any).seconds = musicalToRealTime(currentTime);

      if (!wasPaused) {
        Tone.getTransport().start(undefined, musicalToRealTime(currentTime));
        audioStartTime =
          Tone.getContext().now() - musicalToRealTime(currentTime);
        if (!animationFrameId && isPlaying) {
          animationFrameId = requestAnimationFrame(animate);
        }
      }
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
      if (filteredNotes.length > 0)
        pianoRoll.updateActiveNotes(currentTime, filteredNotes);
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
      if (filteredNotes.length > 0)
        pianoRoll.updateActiveNotes(currentTime, filteredNotes);
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
    if (filteredNotes.length > 0)
      pianoRoll.updateActiveNotes(currentTime, filteredNotes);
    drawPianoRoll();
    if (val >= totalDuration) {
      Tone.getTransport().pause();
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
    if (filteredNotes.length > 0)
      pianoRoll.updateActiveNotes(currentTime, filteredNotes);
    drawPianoRoll();
    isSliding = false;
  }

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
    if (startY === null || startX === null) return;
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
      if (filteredNotes.length > 0)
        pianoRoll.updateActiveNotes(currentTime, filteredNotes);
      (Tone.getTransport() as any).seconds = musicalToRealTime(currentTime);
      drawPianoRoll();
      lastY = e.clientY;
    }
  }
  function handleCanvasPointerUp(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerId !== activePointerId) return;
    if (startY === null || startX === null) return;

    const deltaY = Math.abs(e.clientY - startY);
    const deltaX = Math.abs(e.clientX - startX);

    if (isSwiping) {
      if (wasPlayingBeforeInteraction) {
        Tone.getTransport().start(undefined, musicalToRealTime(currentTime));
        audioStartTime =
          Tone.getContext().now() - musicalToRealTime(currentTime);
        isPaused = false;
        requestAnimationFrame(animate);
      }
    } else {
      if (deltaY < swipeThreshold && deltaX < swipeThreshold) {
        if (!isPlaying) {
          playMidi();
        } else if (isPaused && !wasPlayingBeforeInteraction) {
          togglePauseResume();
        } else if (!wasPlayingBeforeInteraction) {
          togglePauseResume();
        }
      }
    }

    if (filteredNotes.length > 0)
      pianoRoll.updateActiveNotes(currentTime, filteredNotes);
    drawPianoRoll();

    startX = null;
    startY = null;
    lastY = null;
    isSwiping = false;
    activePointerId = null;
    if (canvas) canvas.releasePointerCapture(e.pointerId);
    wasPlayingBeforeInteraction = false;
  }

  function pauseAtEnd() {
    Tone.getTransport().pause();
    isPlaying = false;
    isPaused = true;
    currentTime = totalDuration;
    if (filteredNotes.length > 0)
      pianoRoll.updateActiveNotes(currentTime, filteredNotes);
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
    if (filteredNotes.length > 0)
      pianoRoll.updateActiveNotes(currentTime, filteredNotes);
    drawPianoRoll();
  }

  function updateSwipeFactor() {
    if (pianoRoll && pianoRoll.canvasCssHeight > 0) {
      const pianoTopY =
        pianoRoll.canvasCssHeight -
        pianoRoll.canvasCssHeight * CONFIG.pianoHeightRatio;
      if (pianoTopY > 0 && pianoRoll.visibleSeconds > 0) {
        swipeFactor = pianoRoll.visibleSeconds / pianoTopY;
      } else {
        swipeFactor = 0.01;
      }
    } else {
      swipeFactor = 0.01;
    }
  }

  useResizeObserver({
    element: () => containerDiv,
    onResize: () => {
      if (pianoRoll) {
        const notesForResize =
          pianoRoll.allNotes && pianoRoll.allNotes.length > 0
            ? pianoRoll.allNotes
            : allNotes;
        const tempAllNotes = pianoRoll.allNotes;
        pianoRoll.allNotes = notesForResize;
        pianoRoll.initCanvas({ fullscreen: fullscreen.isActive, controlsDiv });
        pianoRoll.allNotes = tempAllNotes;
        drawPianoRoll();
        updateSwipeFactor();
      }
    },
  });

  onMount(() => {
    if (browser) {
      if (containerDiv && canvas) {
        pianoRoll.setElements({ canvas, containerDiv });
        pianoRoll.initCanvas({ fullscreen: fullscreen.isActive, controlsDiv });
        drawPianoRoll();
        updateSwipeFactor();
      }
    }
  });
  onDestroy(() => {
    if (!browser) return;
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
    <div class="flex grid-cols-2 flex-col gap-2 sm:grid sm:gap-4">
      <Input
        placeholder="Upload MIDI file"
        type="file"
        accept=".midi,.mid"
        onchange={handleFileChange}
      />
      <Button variant="outline" href="/midi-library">Choose from Library</Button
      >
    </div>
  {/if}

  {#if allNotes.length > 0}
    <PlaybackControls
      bind:controlsDiv
      {fullscreen}
      {midiData}
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
      onpointercancel={handleCanvasPointerUp}
    ></canvas>
  </div>
</div>

<SettingsModal
  {showModal}
  audioVisualOffset={pianoRoll.audioVisualOffset}
  showLabels={pianoRoll.showLabels}
  visibleSeconds={pianoRoll.visibleSeconds}
  showOctaveLines={pianoRoll.showOctaveLines}
  tracks={trackNames}
  {activeTrackIndices}
  {toggleTrack}
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
    updateSwipeFactor();
  }}
  setShowOctaveLines={(val) => {
    pianoRoll.setShowOctaveLines(val);
    drawPianoRoll();
  }}
/>
<FpsCounter {fps} />
