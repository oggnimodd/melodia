<script lang="ts">
  import * as Tone from "tone";
  import { parseMidiFile } from "$lib/midi/parser";
  import { Input } from "$lib/components/ui/input";
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { untrack } from "svelte";
  import {
    CONFIG,
    midiToNoteNameNoOctave,
    getLayoutOffsetRaw,
    getKeyX,
    getKeyWidth,
    isBlackKey,
    getTrackColor,
    createSalamanderPiano,
  } from "$lib/utils/piano";
  import { formatSecondsToTime } from "$lib/utils/time";
  import useFullScreen from "$lib/hooks/useFullscreen.svelte";
  import { SvelteSet, SvelteMap } from "svelte/reactivity";
  import type { Notes } from "$lib/models/midi";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import PlaybackControls from "$lib/components/PlaybackControls.svelte";
  import { useResizeObserver } from "$lib/hooks/useResizeObserver.svelte";

  let containerDiv = $state<HTMLDivElement | null>(null);
  let controlsDiv = $state<HTMLDivElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let ctx = $state<CanvasRenderingContext2D | null>(null);
  let midiFile = $state<File | null>(null);
  let midiData = $state<Awaited<ReturnType<typeof parseMidiFile>> | null>(null);
  let allNotes: Notes = $state([]);
  let pianoSampler = $state<Tone.Sampler | null>(null);
  let isPlaying = $state(false);
  let isPaused = $state(false);
  let currentTime = $state(0);
  let animationFrameId = $state<number | null>(null);
  let minMidi = $state(24);
  let maxMidi = $state(108);
  let minOffset = $state(0);
  let maxOffset = $state(0);
  let scale = $state(1);
  let leftOffset = $state(0);
  let canvasCssWidth = 0;
  let canvasCssHeight = 0;
  let fps = $state(0);
  let lastFrameTimestamp = $state<number | null>(null);
  let activeNotes = new SvelteSet<number>();
  let keyCache = new SvelteMap<number, { x: number; w: number }>();
  function updateKeyCache() {
    keyCache.clear();
    for (let midi = 0; midi < 128; midi++) {
      keyCache.set(midi, {
        x: getKeyX(midi, leftOffset, scale),
        w: getKeyWidth(midi, scale),
      });
    }
  }
  let cachedActiveMidiTracks = new SvelteMap<number, number>();
  let totalDuration = $derived(midiData?.totalDuration || 0);
  let audioStartTime = 0;
  let startY = $state<number | null>(null);
  let startX = $state<number | null>(null);
  let lastY = $state<number | null>(null);
  let isSwiping = $state(false);
  let swipeThreshold = 15;
  let wasPlayingBeforeInteraction = $state(false);
  let initialTimeBeforeSwipe = $state(0);
  let activePointerId: number | null = $state(null);
  let swipeFactor = $state(1);
  let { fullscreen, toggle: toggleFullscreen } = useFullScreen();
  let showModal = $state(false);
  let showLabels = $state(true);
  let audioVisualOffset = $state(-0.1);

  // --- BPM / Speed State & Helpers ---
  let originalBPM = $state(120); // from MIDI header or fallback
  let speedPercent = $state(100); // percentage (20-200%)
  let userBPM = $state(120); // current playback BPM

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
    // Update transport if playing
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

  // --- Other Functions (unchanged unless noted) ---
  function handleResetOffset() {
    audioVisualOffset = -0.1;
  }
  function handleCloseModal() {
    showModal = false;
  }
  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      if (isPlaying) haltPlayback();
      activeNotes.clear();
      cachedActiveMidiTracks.clear();
      midiData = null;
      allNotes = [];
      midiFile = input.files[0];
    }
  }
  function initCanvas() {
    if (!containerDiv || !canvas) return;
    const containerHeight = containerDiv.offsetHeight;
    const containerWidth = containerDiv.offsetWidth;
    let finalWidth = containerWidth;
    let finalHeight = fullscreen.isActive
      ? containerHeight - (controlsDiv?.offsetHeight || 0)
      : window.innerHeight * 0.7;
    if (finalHeight < 0) finalHeight = containerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvasCssWidth = finalWidth;
    canvasCssHeight = finalHeight;
    canvas.width = finalWidth * dpr;
    canvas.height = finalHeight * dpr;
    canvas.style.width = finalWidth + "px";
    canvas.style.height = finalHeight + "px";
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(dpr, dpr);
    context.imageSmoothingEnabled = false;
    ctx = context;
    ctx.clearRect(0, 0, finalWidth, finalHeight);
    if (!allNotes.length) return;
    const actualMin = minMidi;
    const actualMax = maxMidi;
    const center = (actualMin + actualMax) / 2;
    const actualOctaves = Math.ceil((actualMax - actualMin + 1) / 12);
    const renderedOctaves = Math.max(actualOctaves, 6);
    const renderedSemitones = renderedOctaves * 12;
    let newMinMidi = Math.floor((center - renderedSemitones / 2) / 12) * 12;
    let newMaxMidi = newMinMidi + renderedSemitones - 1;
    if (newMinMidi > actualMin) {
      newMinMidi = Math.floor(actualMin / 12) * 12;
      newMaxMidi = newMinMidi + renderedSemitones - 1;
    }
    if (newMaxMidi < actualMax) {
      newMaxMidi = Math.ceil((actualMax + 1) / 12) * 12 - 1;
      newMinMidi = newMaxMidi - renderedSemitones + 1;
    }
    const extraWhiteKeys = 3;
    const extraSemitones = Math.ceil((extraWhiteKeys * 12) / 7);
    newMaxMidi += extraSemitones;
    minOffset = getLayoutOffsetRaw(newMinMidi);
    maxOffset = getLayoutOffsetRaw(newMaxMidi);
    leftOffset = minOffset;
    scale = finalWidth / (maxOffset - minOffset);
    updateSwipeFactor();
    updateKeyCache();
  }
  function updateSwipeFactor() {
    const pianoTopY =
      canvasCssHeight - canvasCssHeight * CONFIG.pianoHeightRatio;
    swipeFactor = CONFIG.visibleSeconds / pianoTopY;
  }
  function drawPianoKeys() {
    if (!ctx || !canvas) return;
    const c = ctx;
    const pianoHeight = canvasCssHeight * CONFIG.pianoHeightRatio;
    const startY = canvasCssHeight - pianoHeight;
    const activeMidiTracks = cachedActiveMidiTracks;
    const totalWidthUnits = canvasCssWidth / scale;
    const renderedMinMidi = Math.max(0, Math.floor(leftOffset / 7) * 12);
    const renderedMaxMidi = Math.min(
      127,
      Math.ceil((leftOffset + totalWidthUnits) / 7) * 12
    );
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (isBlackKey(midi)) continue;
      const key = keyCache.get(midi);
      if (!key) continue;
      const { x, w } = key;
      const track = activeMidiTracks.get(midi);
      const fillColor =
        track !== undefined
          ? getTrackColor(track, true, false)
          : CONFIG.whiteKeyColor;
      c.fillStyle = fillColor;
      c.fillRect(x, startY, w, pianoHeight);
      c.strokeStyle = "#000";
      c.strokeRect(x, startY, w, pianoHeight);
    }
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (!isBlackKey(midi)) continue;
      const key = keyCache.get(midi);
      if (!key) continue;
      const { x, w } = key;
      const h = pianoHeight * CONFIG.blackKeyHeightRatio;
      const track = activeMidiTracks.get(midi);
      const fillColor =
        track !== undefined
          ? getTrackColor(track, true, true)
          : CONFIG.blackKeyColor;
      c.fillStyle = fillColor;
      c.fillRect(x, startY, w, h);
    }
    if (showLabels) {
      c.fillStyle = CONFIG.fontColor;
      const keyFontSize = pianoHeight * 0.15;
      c.font = "500 " + keyFontSize + "px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      const keyYOffset = pianoHeight * 0.11;
      for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
        if (isBlackKey(midi)) continue;
        const key = keyCache.get(midi);
        if (!key) continue;
        const { x, w } = key;
        c.fillText(
          midiToNoteNameNoOctave(midi),
          x + w / 2,
          canvasCssHeight - keyYOffset
        );
      }
    }
  }
  function drawNotes() {
    if (!ctx || !canvas) return;
    const c = ctx;
    const pianoTopY =
      canvasCssHeight - canvasCssHeight * CONFIG.pianoHeightRatio;
    const speed = pianoTopY / CONFIG.visibleSeconds;
    const visibleStart = currentTime - CONFIG.visibleSeconds;
    const visibleEnd = currentTime + CONFIG.visibleSeconds;
    const startIdx = allNotes.findIndex(
      (n) => n.time + audioVisualOffset + n.duration >= visibleStart
    );
    if (startIdx === -1) return;
    for (let i = startIdx; i < allNotes.length; i++) {
      const note = allNotes[i];
      if (note.time + audioVisualOffset > visibleEnd) break;
      const appearTime = note.time + audioVisualOffset - CONFIG.visibleSeconds;
      const timeSinceAppear = currentTime - appearTime;
      const bottomY = timeSinceAppear * speed;
      const noteHeight = note.duration * speed;
      const topY = bottomY - noteHeight;
      const key = keyCache.get(note.midi);
      if (!key) continue;
      const { x, w } = key;
      const noteRadius = Math.min(w * 0.1, Math.min(w / 2, noteHeight / 2));
      c.fillStyle = getTrackColor(note.track, true, isBlackKey(note.midi));
      c.beginPath();
      c.moveTo(x + noteRadius, topY);
      c.lineTo(x + w - noteRadius, topY);
      c.arcTo(x + w, topY, x + w, topY + noteRadius, noteRadius);
      c.lineTo(x + w, bottomY - noteRadius);
      c.arcTo(x + w, bottomY, x + w - noteRadius, bottomY, noteRadius);
      c.lineTo(x + noteRadius, bottomY);
      c.arcTo(x, bottomY, x, bottomY - noteRadius, noteRadius);
      c.lineTo(x, topY + noteRadius);
      c.arcTo(x, topY, x + noteRadius, topY, noteRadius);
      c.fill();
      if (showLabels && noteHeight > 15) {
        c.fillStyle = "#fff";
        c.font = "bold 12px sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(
          midiToNoteNameNoOctave(note.midi),
          x + w / 2,
          topY + noteHeight / 2
        );
      }
    }
  }
  function drawAll() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvasCssWidth, canvasCssHeight);
    if (!midiFile || allNotes.length === 0) return;
    untrack(() => {
      drawNotes();
      drawPianoKeys();
    });
  }
  function updateActiveNotes() {
    activeNotes.clear();
    cachedActiveMidiTracks.clear();
    for (const note of allNotes) {
      const activationTime = note.time + audioVisualOffset;
      const deactivationTime = note.time + note.duration + audioVisualOffset;
      if (currentTime >= activationTime && currentTime <= deactivationTime) {
        activeNotes.add(note.id);
        cachedActiveMidiTracks.set(note.midi, note.track);
      }
    }
  }

  function animate() {
    if (!isPlaying || !ctx || !canvas) return;
    // Compute FPS using performance.now()
    const nowPerf = performance.now();
    if (lastFrameTimestamp !== null) {
      const delta = nowPerf - lastFrameTimestamp;
      fps = 1000 / delta;
    }
    lastFrameTimestamp = nowPerf;

    // Compute musical time based on Tone's audio clock
    const nowAudio = Tone.getContext().now();
    const elapsedReal = nowAudio - audioStartTime;
    const newMusicalTime = realToMusicalTime(elapsedReal);
    // Smooth update of currentTime with your smoothing factor
    currentTime += (newMusicalTime - currentTime) * 0.11;
    if (currentTime >= totalDuration) {
      pauseAtEnd();
      return;
    }
    updateActiveNotes();
    drawAll();
    animationFrameId = requestAnimationFrame(animate);
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
    // Schedule notes converting musical time to real time
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
    // Set base time for smooth animation
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
      // Update audioStartTime so that the smooth animation resumes correctly
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
      drawAll();
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
      drawAll();
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
    updateActiveNotes();
    drawAll();
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
    updateActiveNotes();
    drawAll();
    isSliding = false;
  }

  let currentTimeFormatted = $derived(formatSecondsToTime(currentTime));
  let totalDurationFormatted = $derived(formatSecondsToTime(totalDuration));

  // --- Process MIDI File & Set BPM ---
  $effect(() => {
    if (!midiFile) return;
    (async () => {
      const data = await parseMidiFile(midiFile);
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
        let trackMin = Math.min(...allNotes.map((n) => n.midi));
        let trackMax = Math.max(...allNotes.map((n) => n.midi));
        minMidi = trackMin;
        maxMidi = trackMax;
        minOffset = getLayoutOffsetRaw(minMidi);
        maxOffset = getLayoutOffsetRaw(maxMidi);
      }
      if (data.header?.tempos && data.header.tempos.length > 0) {
        originalBPM = data.header.tempos[0].bpm;
      } else {
        originalBPM = 120;
      }
      speedPercent = 100;
      userBPM = originalBPM;
      Tone.getTransport().bpm.value = userBPM;
      initCanvas();
      drawAll();
    })();
  });

  useResizeObserver({
    element: () => containerDiv,
    onResize: () => {
      console.log("here");
      initCanvas();
      drawAll();
    },
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

  function handleCanvasPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastY = e.clientY;
    isSwiping = false;
    wasPlayingBeforeInteraction = isPlaying && !isPaused;
    initialTimeBeforeSwipe = currentTime;
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
      updateActiveNotes();
      (Tone.getTransport() as any).seconds = musicalToRealTime(currentTime);
      drawAll();
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
    updateActiveNotes();
    drawAll();
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
    drawAll();
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
    drawAll();
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
      {midiFile}
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
  {audioVisualOffset}
  {showLabels}
  onClose={handleCloseModal}
  onResetOffset={handleResetOffset}
  setShowLabels={(val) => {
    showLabels = val;
    // Auto reflect changes in the piano
    (!isPlaying || isPaused) && drawAll();
  }}
  setAudioVisualOffset={(val) => (audioVisualOffset = val)}
/>
<div
  class="pointer-events-none fixed right-2 top-2 z-50 rounded bg-gray-800 bg-opacity-75 px-2 py-1 text-sm text-white"
>
  FPS: {fps.toFixed(1)}
</div>
