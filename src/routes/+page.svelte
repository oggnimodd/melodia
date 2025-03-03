<script lang="ts">
  import * as Tone from "tone";
  import { parseMidiFile } from "$lib/midi/parser";
  import Button from "$lib/components/ui/button/button.svelte";
  import Slider from "$lib/components/ui/slider/slider.svelte";
  import { Input } from "$lib/components/ui/input";
  import IconPlayerPlay from "@tabler/icons-svelte/icons/player-play-filled";
  import IconPlayerPause from "@tabler/icons-svelte/icons/player-pause-filled";
  import IconPlayerResume from "@tabler/icons-svelte/icons/player-track-next-filled";
  import IconPlayerSkipBack from "@tabler/icons-svelte/icons/player-skip-back-filled";
  import IconPlayerSkipForward from "@tabler/icons-svelte/icons/player-skip-forward-filled";
  import IconMaximize from "@tabler/icons-svelte/icons/maximize";
  import IconSettings from "@tabler/icons-svelte/icons/settings";
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { untrack } from "svelte";
  import { cn } from "$lib/utils";
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
  let lastFrameTime = $state(0);
  let animationStartTime = $state(0);
  let lastTransportTime = $state(0);
  let canvasCssWidth = 0;
  let canvasCssHeight = 0;
  // FPS counter states
  let fps = $state(0);
  let lastFrameTimestamp = $state<number | null>(null);

  // Instead of scheduling active notes, we update them on every frame.
  let activeNotes = new SvelteSet<number>();

  // Use reactive SvelteMap for caching key positions/widths.
  let keyCache = new SvelteMap<number, { x: number; w: number }>();
  function updateKeyCache() {
    keyCache.clear();
    // Cache for all possible midi values (0-127)
    for (let midi = 0; midi < 128; midi++) {
      keyCache.set(midi, {
        x: getKeyX(midi, leftOffset, scale),
        w: getKeyWidth(midi, scale),
      });
    }
  }

  // Reactive map for active midi tracks computed from active notes.
  let cachedActiveMidiTracks = new SvelteMap<number, number>();

  let totalDuration = $derived(midiData?.totalDuration || 0);
  // For syncing with the audio clock
  let audioStartTime = 0;
  // Swipe detection
  let startY = $state<number | null>(null);
  let startX = $state<number | null>(null);
  let lastY = $state<number | null>(null);
  let isSwiping = $state(false);
  let swipeThreshold = 15;
  let wasPlayingBeforeInteraction = $state(false);
  let initialTimeBeforeSwipe = $state(0);
  let activePointerId: number | null = $state(null);
  let swipeFactor = $state(1);
  // Fullscreen hook
  let { fullscreen, toggle: toggleFullscreen } = useFullScreen();

  // --- Calibration variables ---
  let audioVisualOffset = $state(-0.1); // default offset in seconds
  let showCalibrationModal = $state(false);

  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      if (isPlaying) {
        haltPlayback();
      }

      // Clear previous active keys cache
      activeNotes.clear();
      cachedActiveMidiTracks.clear();

      midiData = null;
      allNotes = [];
      midiFile = input.files[0];
    }
  }

  function initCanvas() {
    if (!containerDiv || !canvas) return;

    // Get container dimensions
    const containerHeight = containerDiv.offsetHeight;
    const containerWidth = containerDiv.offsetWidth;
    let finalWidth = containerWidth;
    let finalHeight = 0;

    if (fullscreen.isActive) {
      const controlsHeight = controlsDiv?.offsetHeight || 0;
      finalHeight = containerHeight - controlsHeight;
      if (finalHeight < 0) finalHeight = containerHeight;
    } else {
      finalHeight = window.innerHeight * 0.7;
    }

    // Setup canvas with devicePixelRatio
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

    // --- Calculate rendered range using octaves ---
    const actualMin = minMidi;
    const actualMax = maxMidi;
    const center = (actualMin + actualMax) / 2;

    // Compute how many octaves your notes span. One octave = 12 semitones.
    const actualOctaves = Math.ceil((actualMax - actualMin + 1) / 12);
    // Enforce a minimum of 6 octaves.
    const renderedOctaves = Math.max(actualOctaves, 6);
    const renderedSemitones = renderedOctaves * 12;

    // Center the rendered range around the note center and snap to a C (multiple of 12)
    let newMinMidi = Math.floor((center - renderedSemitones / 2) / 12) * 12;
    let newMaxMidi = newMinMidi + renderedSemitones - 1;

    // Ensure the rendered range fully covers your actual notes.
    if (newMinMidi > actualMin) {
      newMinMidi = Math.floor(actualMin / 12) * 12;
      newMaxMidi = newMinMidi + renderedSemitones - 1;
    }
    if (newMaxMidi < actualMax) {
      newMaxMidi = Math.ceil((actualMax + 1) / 12) * 12 - 1;
      newMinMidi = newMaxMidi - renderedSemitones + 1;
    }

    // After your final checks to ensure you cover actualMin..actualMax:
    const extraWhiteKeys = 3;
    // Convert white keys to semitones (7 white keys per 12 semitones):
    const extraSemitones = Math.ceil((extraWhiteKeys * 12) / 7);
    newMaxMidi += extraSemitones;

    // Compute layout offsets and scale to fill the canvas exactly.
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

    // Use cached active midi tracks from the reactive map.
    const activeMidiTracks = cachedActiveMidiTracks;

    const totalWidthUnits = canvasCssWidth / scale;
    const renderedMinMidi = Math.max(0, Math.floor(leftOffset / 7) * 12);
    const renderedMaxMidi = Math.min(
      127,
      Math.ceil((leftOffset + totalWidthUnits) / 7) * 12
    );

    // Draw white keys first
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (isBlackKey(midi)) continue;
      const key = keyCache.get(midi);
      if (!key) continue;
      const x = key.x;
      const w = key.w;
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

    // Draw black keys
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (!isBlackKey(midi)) continue;
      const key = keyCache.get(midi);
      if (!key) continue;
      const x = key.x;
      const w = key.w;
      const h = pianoHeight * CONFIG.blackKeyHeightRatio;
      const track = activeMidiTracks.get(midi);
      const fillColor =
        track !== undefined
          ? getTrackColor(track, true, true)
          : CONFIG.blackKeyColor;
      c.fillStyle = fillColor;
      c.fillRect(x, startY, w, h);
    }

    // Optionally add note names on white keys
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
      const x = key.x;
      const w = key.w;
      c.fillText(
        midiToNoteNameNoOctave(midi),
        x + w / 2,
        canvasCssHeight - keyYOffset
      );
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
    const noteRadiusPercent = 0.1;
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
      const x = key.x;
      const w = key.w;
      const noteRadius = Math.min(
        w * noteRadiusPercent,
        Math.min(w / 2, noteHeight / 2)
      );
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
      if (noteHeight > 15) {
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
    // FPS calculation
    const now = performance.now();
    if (lastFrameTimestamp !== null) {
      const delta = now - lastFrameTimestamp;
      fps = 1000 / delta;
    }
    lastFrameTimestamp = now;
    const newTime = Tone.getContext().now() - audioStartTime;
    // Keep the smoothing factor
    const smoothingFactor = 0.11;
    currentTime += (newTime - currentTime) * smoothingFactor;

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
    animationStartTime = 0;
    lastFrameTime = 0;
    lastTransportTime = 0;
    await Tone.start();
    if (!pianoSampler) {
      pianoSampler = createSalamanderPiano();
    }
    await Tone.loaded();
    const transport = Tone.getTransport();
    transport.cancel(0);
    transport.stop();
    for (const n of allNotes) {
      transport.schedule((time) => {
        pianoSampler!.triggerAttackRelease(n.name, n.duration, time);
      }, n.time);
    }
    audioStartTime = Tone.getContext().now();
    transport.start();
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
      Tone.getTransport().start(undefined, currentTime);
      isPaused = false;
      audioStartTime = Tone.getContext().now() - currentTime;
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
      Tone.getTransport().start(undefined, newTime);
      audioStartTime = Tone.getContext().now() - newTime;
      requestAnimationFrame(animate);
    } else {
      audioStartTime = Tone.getContext().now() - newTime;
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
      Tone.getTransport().start(undefined, newTime);
      audioStartTime = Tone.getContext().now() - newTime;
      requestAnimationFrame(animate);
    } else {
      audioStartTime = Tone.getContext().now() - newTime;
      drawAll();
    }
  }

  let isSliding = $state(false);
  let wasPlayingBeforeSlide = $state(false);
  function handleSliderMouseDown(e: MouseEvent) {
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
    // Update active notes and redraw the canvas right away
    updateActiveNotes();
    drawAll();
    if (val >= totalDuration) {
      Tone.getTransport().pause();
      isPlaying = false;
      isPaused = true;
    } else {
      audioStartTime = Tone.getContext().now() - val;
      Tone.getTransport().seconds = val;
    }
  }

  function handleSliderMouseUp() {
    if (wasPlayingBeforeSlide) {
      const val = currentTime;
      Tone.getTransport().start(undefined, val);
      isPaused = false;
      audioStartTime = Tone.getContext().now() - val;
      requestAnimationFrame(animate);
      wasPlayingBeforeSlide = false;
    }
    // When not playing, update active notes and redraw one last time
    updateActiveNotes();
    drawAll();
    isSliding = false;
  }
  let currentTimeFormatted = $derived(formatSecondsToTime(currentTime));
  let totalDurationFormatted = $derived(formatSecondsToTime(totalDuration));

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
      initCanvas();
      drawAll();
    })();
  });

  $effect(() => {
    if (!containerDiv) return;
    const ro = new ResizeObserver(() => {
      initCanvas();
      drawAll();
    });
    ro.observe(containerDiv);
    const handleWindowResize = () => {
      initCanvas();
      drawAll();
    };
    window.addEventListener("resize", handleWindowResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
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
    if (canvas) {
      canvas.setPointerCapture(e.pointerId);
    }
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
      updateActiveNotes(); // update active notes when swiping
      Tone.getTransport().seconds = currentTime;
      audioStartTime = Tone.getContext().now() - currentTime;
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
      } else if (wasPlayingBeforeInteraction) {
        // Keep paused.
      } else {
        togglePauseResume();
      }
    } else {
      if (wasPlayingBeforeInteraction) {
        Tone.getTransport().start(undefined, currentTime);
        isPaused = false;
        audioStartTime = Tone.getContext().now() - currentTime;
        requestAnimationFrame(animate);
      }
    }
    // Update active notes and redraw after the pointer ends
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

      // Preload the sampler immediately
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
    <div
      class="flex items-center justify-center gap-4 text-white"
      class:mt-4={!fullscreen.isActive}
      bind:this={controlsDiv}
    >
      {#if midiFile}
        <div class="mt-4 flex items-center gap-x-3">
          <Button
            class={cn("", {
              "bg-green-500 hover:bg-green-600":
                !isPlaying || currentTime >= totalDuration,
              "bg-yellow-500 hover:bg-yellow-600": isPlaying && !isPaused,
              "bg-blue-500 hover:bg-blue-600": isPlaying && isPaused,
            })}
            size="icon-sm"
            onclick={handlePlayButtonClick}
          >
            {#if !isPlaying || currentTime >= totalDuration}
              <IconPlayerPlay />
            {:else if isPlaying && !isPaused}
              <IconPlayerPause />
            {:else}
              <IconPlayerResume />
            {/if}
          </Button>
          <Button
            class="bg-purple-500 hover:bg-purple-600"
            size="icon-sm"
            disabled={!midiFile || currentTime <= 0}
            onmouseup={seekBackward}
          >
            <IconPlayerSkipBack />
          </Button>
          <Button
            class="bg-purple-500 hover:bg-purple-600"
            size="icon-sm"
            disabled={!midiFile || currentTime >= totalDuration}
            onmouseup={seekForward}
          >
            <IconPlayerSkipForward />
          </Button>
          <Button
            size="icon-sm"
            disabled={!midiFile}
            onclick={toggleFullscreen}
          >
            <IconMaximize />
          </Button>
          <Button
            class="bg-orange-500 hover:bg-orange-600"
            size="icon-sm"
            onclick={() => (showCalibrationModal = true)}
          >
            <IconSettings />
          </Button>
        </div>
      {/if}
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
    </div>
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
{#if showCalibrationModal}
  <!-- Modal overlay for calibration -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
  >
    <div class="w-80 rounded-lg bg-gray-800 p-6">
      <h2 class="mb-4 text-xl font-semibold text-white">Calibrate A/V Sync</h2>
      <p class="mb-4 text-sm text-gray-300">
        Adjust the slider until the visual tiles match the piano keys being
        pressed.
        <strong>
          If the visuals are too fast (you hear the audio before you see the
          keys pressed), slide right to delay them; if they're too slow, slide
          left.
        </strong>
      </p>
      <div class="mb-2 flex items-center gap-2">
        <span class="text-sm text-white"
          >Offset: {audioVisualOffset.toFixed(2)}s</span
        >
      </div>
      <Slider
        value={audioVisualOffset}
        min={-0.5}
        max={0.5}
        step={0.01}
        oninput={(e) => {
          audioVisualOffset = parseFloat((e.target as HTMLInputElement).value);
        }}
      />
      <div class="mt-4 flex justify-end gap-2">
        <!-- Reset button -->
        <Button size="sm" onclick={() => (audioVisualOffset = -0.1)}
          >Reset</Button
        >
        <Button size="sm" onclick={() => (showCalibrationModal = false)}
          >Close</Button
        >
      </div>
    </div>
  </div>
{/if}

<!-- FPS Counter -->
<div
  class="fixed right-2 top-2 z-50 rounded bg-gray-800 bg-opacity-75 px-2 py-1 text-sm text-white"
>
  FPS: {fps.toFixed(1)}
</div>
