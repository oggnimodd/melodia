<script lang="ts">
  import * as Tone from "tone";
  import { parseMidiFile } from "$lib/midi/parser";
  import Button from "$lib/components/ui/button/button.svelte";
  import Slider from "$lib/components/ui/slider/slider.svelte";
  import { Input } from "$lib/components/ui/input";
  import IconPlayerPlay from "@tabler/icons-svelte/icons/player-play-filled";
  import IconPlayerPause from "@tabler/icons-svelte/icons/player-pause-filled";
  import IconPlayerResume from "@tabler/icons-svelte/icons/player-track-next-filled";
  import IconMaximize from "@tabler/icons-svelte/icons/maximize";
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { untrack } from "svelte";
  import { cn } from "$lib/utils";

  let containerDiv = $state<HTMLDivElement | null>(null);
  let controlsDiv = $state<HTMLDivElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let ctx = $state<CanvasRenderingContext2D | null>(null);
  let midiFile = $state<File | null>(null);
  let midiData = $state<Awaited<ReturnType<typeof parseMidiFile>> | null>(null);
  let allNotes = $state<
    Array<{ time: number; duration: number; midi: number; name: string }>
  >([]);
  let pianoSampler = $state<Tone.Sampler | null>(null);
  let isPlaying = $state(false);
  let isPaused = $state(false);
  let isFullscreen = $state(false);
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
  let totalDuration = $derived(midiData?.totalDuration || 0);

  // Add these variables for swipe detection
  let startY = $state<number | null>(null);
  let startX = $state<number | null>(null);
  let lastY = $state<number | null>(null);
  let isSwiping = $state(false);
  let swipeThreshold = 15; // Pixels to consider as swipe vs click
  let wasPlayingBeforeInteraction = $state(false);
  let initialTimeBeforeSwipe = $state(0);

  const octaveLayout = [
    { semitone: 0, isBlack: false, offset: 0 },
    { semitone: 1, isBlack: true, offset: 0.65 },
    { semitone: 2, isBlack: false, offset: 1 },
    { semitone: 3, isBlack: true, offset: 1.65 },
    { semitone: 4, isBlack: false, offset: 2 },
    { semitone: 5, isBlack: false, offset: 3 },
    { semitone: 6, isBlack: true, offset: 3.65 },
    { semitone: 7, isBlack: false, offset: 4 },
    { semitone: 8, isBlack: true, offset: 4.65 },
    { semitone: 9, isBlack: false, offset: 5 },
    { semitone: 10, isBlack: true, offset: 5.65 },
    { semitone: 11, isBlack: false, offset: 6 },
  ];

  const CONFIG = {
    pianoHeightRatio: 0.15,
    blackKeyHeightRatio: 0.6,
    blackKeyWidthRatio: 0.6,
    visibleSeconds: 3,
    whiteKeyColor: "#ffffff",
    blackKeyColor: "#000000",
    activeWhiteKeyColor: "#ffcc00",
    activeBlackKeyColor: "#ff9900",
    inactiveNoteColor: "#2196F3",
    activeNoteColor: "#4CAF50",
    fontColor: "#000000",
  };

  function midiToNoteNameNoOctave(midi: number): string {
    const names = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    return names[midi % 12];
  }
  function getOctaveLayout(midi: number) {
    return octaveLayout[midi % 12];
  }
  function getLayoutOffsetRaw(midi: number) {
    const noteOctave = Math.floor(midi / 12);
    return noteOctave * 7 + getOctaveLayout(midi).offset;
  }
  function getKeyX(midi: number): number {
    return (getLayoutOffsetRaw(midi) - leftOffset) * scale;
  }
  function getKeyWidth(midi: number): number {
    return getOctaveLayout(midi).isBlack
      ? scale * CONFIG.blackKeyWidthRatio
      : scale;
  }
  function isBlackKey(midi: number): boolean {
    return getOctaveLayout(midi).isBlack;
  }
  function getActiveKeys(time: number): Set<number> {
    const active = new Set<number>();
    for (const note of allNotes) {
      if (note.time > time) break;
      if (time >= note.time && time <= note.time + note.duration) {
        active.add(note.midi);
      }
    }
    return active;
  }
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
  $effect(() => {
    if (!midiFile) return;
    (async () => {
      const data = await parseMidiFile(midiFile);
      midiData = data;
      const newNotes: typeof allNotes = [];
      data.tracks.forEach((track) => {
        track.notes.forEach((note) => {
          newNotes.push({
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
  function initCanvas() {
    if (!containerDiv || !canvas) return;
    const containerHeight = containerDiv.offsetHeight;
    const containerWidth = containerDiv.offsetWidth;
    let finalWidth = containerWidth;
    let finalHeight = 0;
    if (isFullscreen) {
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
  }
  function drawPianoKeys() {
    if (!ctx || !canvas) return;
    const c = ctx;
    const pianoHeight = canvasCssHeight * CONFIG.pianoHeightRatio;
    const startY = canvasCssHeight - pianoHeight;
    const active = getActiveKeys(currentTime);
    const totalWidthUnits = canvasCssWidth / scale;
    const renderedMinMidi = Math.max(0, Math.floor(leftOffset / 7) * 12);
    const renderedMaxMidi = Math.min(
      127,
      Math.ceil((leftOffset + totalWidthUnits) / 7) * 12
    );
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (isBlackKey(midi)) continue;
      const x = getKeyX(midi);
      const w = getKeyWidth(midi);
      const isActive = active.has(midi);
      c.fillStyle = isActive
        ? CONFIG.activeWhiteKeyColor
        : CONFIG.whiteKeyColor;
      c.fillRect(x, startY, w - 1, pianoHeight);
      c.strokeStyle = "#000";
      c.strokeRect(x, startY, w - 1, pianoHeight);
    }
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (!isBlackKey(midi)) continue;
      const x = getKeyX(midi);
      const w = getKeyWidth(midi);
      const h = pianoHeight * CONFIG.blackKeyHeightRatio;
      const isActive = active.has(midi);
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
      const x = getKeyX(midi);
      const w = getKeyWidth(midi);
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
      (n) => n.time + n.duration >= visibleStart
    );
    if (startIdx === -1) return;
    for (let i = startIdx; i < allNotes.length; i++) {
      const note = allNotes[i];
      if (note.time > visibleEnd) break;
      const appearTime = note.time - CONFIG.visibleSeconds;
      const timeSinceAppear = currentTime - appearTime;
      const bottomY = timeSinceAppear * speed;
      const noteHeight = note.duration * speed;
      const topY = bottomY - noteHeight;
      const x = getKeyX(note.midi);
      const w = getKeyWidth(note.midi) - 2;
      const isActive =
        currentTime >= note.time && currentTime <= note.time + note.duration;
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
  function animate(timestamp: number) {
    if (!isPlaying || !ctx || !canvas) return;
    if (animationStartTime === 0) {
      animationStartTime = timestamp - currentTime * 1000;
    }
    const newCurrentTime = (timestamp - animationStartTime) / 1000;
    if (timestamp - lastTransportTime > 100) {
      const transportTime = untrack(() => Tone.getTransport().seconds);
      if (Math.abs(transportTime - newCurrentTime) > 0.1) {
        animationStartTime = timestamp - transportTime * 1000;
      }
      lastTransportTime = timestamp;
    }
    currentTime = newCurrentTime;
    if (currentTime >= totalDuration) {
      pauseAtEnd();
      return;
    }
    drawAll();
    lastFrameTime = timestamp;
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
        release: 1,
        baseUrl: "https://tonejs.github.io/audio/salamander/",
      }).toDestination();
    }
    await Tone.loaded();
    const transport = Tone.getTransport();
    transport.cancel(0);
    transport.stop();
    untrack(() => {
      for (const n of allNotes) {
        transport.schedule((time) => {
          pianoSampler!.triggerAttackRelease(n.name, n.duration, time);
        }, n.time);
      }
    });
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
      animationStartTime = performance.now() - currentTime * 1000;
      requestAnimationFrame(animate);
    }
  }
  // New single-button handler
  function handlePlayButtonClick() {
    if (!isPlaying || currentTime >= totalDuration) {
      playMidi();
    } else {
      togglePauseResume();
    }
  }
  // --- SLIDER HANDLERS ---
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
      // If slider reaches the end, pause playback.
      Tone.getTransport().pause();
      isPlaying = false;
      isPaused = true;
      drawAll();
    } else {
      animationStartTime = performance.now() - val * 1000;
      Tone.getTransport().seconds = val;
      drawAll();
    }
  }
  function handleSliderMouseUp() {
    if (wasPlayingBeforeSlide) {
      const val = currentTime;
      Tone.getTransport().start(undefined, val);
      isPaused = false;
      animationStartTime = performance.now() - val * 1000;
      requestAnimationFrame(animate);
      wasPlayingBeforeSlide = false;
    }
    isSliding = false;
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerDiv
        ?.requestFullscreen()
        .then(() => {
          isFullscreen = true;
        })
        .catch((err) => {
          console.error("Error attempting to enable full-screen mode:", err);
        });
    } else {
      document
        .exitFullscreen()
        .then(() => {
          isFullscreen = false;
        })
        .catch((err) => {
          console.error("Error attempting to exit full-screen mode:", err);
        });
    }
  }
  function formatTime(seconds: number) {
    const floored = Math.floor(seconds);
    const m = Math.floor(floored / 60);
    const s = floored % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  let currentTimeFormatted = $derived(formatTime(currentTime));
  let totalDurationFormatted = $derived(formatTime(totalDuration));
  $effect(() => {
    if (!containerDiv) return;
    initCanvas();
    drawAll();
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

  let pianoTopY = $derived(
    canvasCssHeight - canvasCssHeight * CONFIG.pianoHeightRatio
  );

  function handleCanvasPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
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
    if (startY === null) return;
    const deltaY = e.clientY - startY;
    if (!isSwiping && Math.abs(deltaY) > swipeThreshold) {
      isSwiping = true;
    }
    if (isSwiping) {
      const yDiff = lastY !== null ? e.clientY - lastY : 0;
      const timeAdjustment = (yDiff / pianoTopY) * CONFIG.visibleSeconds;
      currentTime = Math.max(
        0,
        Math.min(totalDuration, currentTime + timeAdjustment)
      );
      Tone.getTransport().seconds = currentTime;
      animationStartTime = performance.now() - currentTime * 1000;
      drawAll();
      lastY = e.clientY;
    }
  }

  function handleCanvasPointerUp(e: PointerEvent) {
    if (e.button !== 0) return;
    if (startY === null) return;
    const deltaY = Math.abs(e.clientY - startY);
    if (deltaY < swipeThreshold) {
      if (!isPlaying) {
        playMidi();
      } else if (isPaused && !wasPlayingBeforeInteraction) {
        togglePauseResume();
      } else if (wasPlayingBeforeInteraction) {
        // Leave it paused
      } else {
        togglePauseResume();
      }
    } else {
      if (wasPlayingBeforeInteraction) {
        Tone.getTransport().start(undefined, currentTime);
        isPaused = false;
        animationStartTime = performance.now() - currentTime * 1000;
        requestAnimationFrame(animate);
      }
    }
    startX = null;
    startY = null;
    lastY = null;
    isSwiping = false;
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
      const handleFullscreenChange = () => {
        isFullscreen = !!document.fullscreenElement;
      };

      document.addEventListener("fullscreenchange", handleFullscreenChange);

      return () => {
        document.removeEventListener(
          "fullscreenchange",
          handleFullscreenChange
        );
      };
    }
  });
</script>

<div
  class={isFullscreen
    ? "m-0 flex h-screen w-full flex-col p-0"
    : "mx-auto max-w-5xl px-4 py-8"}
  bind:this={containerDiv}
>
  {#if !isFullscreen}
    <h1 class="mb-3 text-2xl font-semibold text-white">Melodia</h1>
    <Input type="file" accept=".midi,.mid" onchange={handleFileChange} />
  {/if}
  {#if allNotes.length > 0}
    <div
      class="flex items-center justify-center gap-4 text-white"
      class:mt-4={!isFullscreen}
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
            size="icon-sm"
            disabled={!midiFile}
            onclick={toggleFullscreen}
          >
            <IconMaximize />
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
    class={isFullscreen
      ? "flex-1 overflow-hidden bg-black"
      : "mt-4 overflow-hidden rounded-lg border border-gray-700 bg-black"}
  >
    <canvas
      bind:this={canvas}
      class="w-full"
      onpointerdown={handleCanvasPointerDown}
      onpointermove={handleCanvasPointerMove}
      onpointerup={handleCanvasPointerUp}
    ></canvas>
  </div>
</div>
