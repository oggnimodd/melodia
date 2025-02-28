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
  } from "$lib/utils/piano";
  import { formatSecondsToTime } from "$lib/utils/time";
  import useFullScreen from "$lib/hooks/useFullscreen.svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { Notes } from "$lib/models/midi";

  // DOM and state refs
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

  // Instead of scheduling active notes, we update them on every frame.
  let activeNotes = new SvelteSet<number>();

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
    let finalHeight = 0;
    if (fullscreen.isActive) {
      const controlsHeight = controlsDiv?.offsetHeight || 0;
      const availableHeight = containerHeight - controlsHeight;
      finalHeight = availableHeight > 0 ? availableHeight : containerHeight;
    } else {
      finalHeight = window.innerHeight * 0.7;
    }
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
    const currentWidthUnits = maxOffset - minOffset + 1;
    const minKeys = 31;
    let totalWidthUnits: number;
    let newLeftOffset: number;
    if (currentWidthUnits < minKeys) {
      const extra = minKeys - currentWidthUnits;
      const leftExtra = Math.floor(extra / 2);
      newLeftOffset = minOffset - leftExtra;
      totalWidthUnits = minKeys;
    } else {
      newLeftOffset = minOffset;
      totalWidthUnits = currentWidthUnits;
    }
    leftOffset = newLeftOffset;
    scale = finalWidth / totalWidthUnits;
    updateSwipeFactor();
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
    const activeMidi = new Set<number>();
    for (const note of allNotes) {
      if (activeNotes.has(note.id)) {
        activeMidi.add(note.midi);
      }
    }
    const totalWidthUnits = canvasCssWidth / scale;
    const renderedMinMidi = Math.max(0, Math.floor(leftOffset / 7) * 12);
    const renderedMaxMidi = Math.min(
      127,
      Math.ceil((leftOffset + totalWidthUnits) / 7) * 12
    );
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (isBlackKey(midi)) continue;
      const x = getKeyX(midi, leftOffset, scale);
      const w = getKeyWidth(midi, scale);
      const isActive = activeMidi.has(midi);
      c.fillStyle = isActive
        ? CONFIG.activeWhiteKeyColor
        : CONFIG.whiteKeyColor;
      c.fillRect(x, startY, w - 1, pianoHeight);
      c.strokeStyle = "#000";
      c.strokeRect(x, startY, w - 1, pianoHeight);
    }
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (!isBlackKey(midi)) continue;
      const x = getKeyX(midi, leftOffset, scale);
      const w = getKeyWidth(midi, scale);
      const h = pianoHeight * CONFIG.blackKeyHeightRatio;
      const isActive = activeMidi.has(midi);
      c.fillStyle = isActive
        ? CONFIG.activeBlackKeyColor
        : CONFIG.blackKeyColor;
      c.fillRect(x, startY, w, h);
    }
    c.fillStyle = CONFIG.fontColor;
    const keyFontSize = pianoHeight * 0.15;
    c.font = "500 " + keyFontSize + "px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    const keyYOffset = pianoHeight * 0.11;
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (isBlackKey(midi)) continue;
      const x = getKeyX(midi, leftOffset, scale);
      const w = getKeyWidth(midi, scale);
      c.fillText(
        midiToNoteNameNoOctave(midi),
        x + w / 2,
        canvasCssHeight - keyYOffset
      );
    }
  }

  // Modified drawNotes: now falling tiles use audioVisualOffset so they intersect the keys correctly.
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
      // Use the calibrated time for drawing the falling tile.
      if (note.time + audioVisualOffset > visibleEnd) break;
      const appearTime = note.time + audioVisualOffset - CONFIG.visibleSeconds;
      const timeSinceAppear = currentTime - appearTime;
      const bottomY = timeSinceAppear * speed;
      const noteHeight = note.duration * speed;
      const topY = bottomY - noteHeight;
      const x = getKeyX(note.midi, leftOffset, scale);
      const w = getKeyWidth(note.midi, scale) - 2;
      const isActive = activeNotes.has(note.id);
      c.fillStyle = isActive
        ? CONFIG.activeNoteColor
        : CONFIG.inactiveNoteColor;
      c.fillRect(x, topY, w, noteHeight);
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

  // Update activeNotes based on calibrated timing.
  function updateActiveNotes() {
    activeNotes.clear();
    for (const note of allNotes) {
      const activationTime = note.time + audioVisualOffset;
      const deactivationTime = note.time + note.duration + audioVisualOffset;
      if (currentTime >= activationTime && currentTime <= deactivationTime) {
        activeNotes.add(note.id);
      }
    }
  }

  function animate() {
    if (!isPlaying || !ctx || !canvas) return;
    const newTime = Tone.getContext().now() - audioStartTime;
    const smoothingFactor = 0.1;
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
      pianoSampler = new Tone.Sampler({
        urls: {
          C4: "C4.mp3",
          "D#4": "Ds4.mp3",
          "F#4": "Fs4.mp3",
          A4: "A4.mp3",
        },
        attack: 0,
        release: 0.6,
        baseUrl: "https://tonejs.github.io/audio/salamander/",
      }).toDestination();
    }
    await Tone.loaded();
    const transport = Tone.getTransport();
    transport.cancel(0);
    transport.stop();

    // Schedule only the audio events.
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
    if (val >= totalDuration) {
      Tone.getTransport().pause();
      isPlaying = false;
      isPaused = true;
      drawAll();
    } else {
      audioStartTime = Tone.getContext().now() - val;
      Tone.getTransport().seconds = val;
      drawAll();
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
      data.tracks.forEach((track) => {
        track.notes.forEach((note) => {
          newNotes.push({
            id: noteIdCounter++,
            time: note.time,
            duration: note.duration,
            midi: note.midi,
            name: note.name,
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
