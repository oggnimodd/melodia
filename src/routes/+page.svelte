<script lang="ts">
  import * as Tone from "tone";
  import { parseMidiFile } from "$lib/midi/parser";
  import Button from "$lib/components/ui/button/button.svelte";
  import Slider from "$lib/components/ui/slider/slider.svelte";
  import { Input } from "$lib/components/ui/input";
  import IconPlayerPlay from "@tabler/icons-svelte/icons/player-play-filled";
  import IconPlayerStop from "@tabler/icons-svelte/icons/player-stop-filled";
  import IconPlayerPause from "@tabler/icons-svelte/icons/player-pause-filled";
  import IconPlayerResume from "@tabler/icons-svelte/icons/player-track-next-filled";
  import IconMaximize from "@tabler/icons-svelte/icons/maximize";
  import { onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import { untrack } from "svelte";

  // -- REACTIVE STATES --
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

  // We'll track the logical (CSS) width/height of the canvas so we can draw in correct coords
  let canvasCssWidth = 0;
  let canvasCssHeight = 0;

  // -- DERIVED STATES (unchanged) --
  let totalDuration = $derived(midiData?.totalDuration || 0);

  // -- CONSTANTS --
  const octaveLayout = [
    { semitone: 0, isBlack: false, offset: 0 }, // C
    { semitone: 1, isBlack: true, offset: 0.65 }, // C#
    { semitone: 2, isBlack: false, offset: 1 }, // D
    { semitone: 3, isBlack: true, offset: 1.65 }, // D#
    { semitone: 4, isBlack: false, offset: 2 }, // E
    { semitone: 5, isBlack: false, offset: 3 }, // F
    { semitone: 6, isBlack: true, offset: 3.65 }, // F#
    { semitone: 7, isBlack: false, offset: 4 }, // G
    { semitone: 8, isBlack: true, offset: 4.65 }, // G#
    { semitone: 9, isBlack: false, offset: 5 }, // A
    { semitone: 10, isBlack: true, offset: 5.65 }, // A#
    { semitone: 11, isBlack: false, offset: 6 }, // B
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

  // -- UTILITY FUNCTIONS --
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

  // -- FILE HANDLING --
  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      if (isPlaying) {
        stopMidi();
      }
      midiData = null;
      allNotes = [];
      midiFile = input.files[0];
    }
  }

  // -- MIDI PARSING --
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

  // -- CANVAS HANDLING --
  function initCanvas() {
    if (!containerDiv || !canvas) return;

    const containerHeight = containerDiv.offsetHeight;
    const containerWidth = containerDiv.offsetWidth;

    // figure out final size in CSS pixels
    let finalWidth = containerWidth;
    let finalHeight = 0;

    if (isFullscreen) {
      const controlsHeight = controlsDiv?.offsetHeight || 0;
      const availableHeight = containerHeight - controlsHeight;
      finalHeight = availableHeight > 0 ? availableHeight : containerHeight;
    } else {
      finalHeight = window.innerHeight * 0.7;
    }

    // handle devicePixelRatio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvasCssWidth = finalWidth;
    canvasCssHeight = finalHeight;

    // set canvas to device-pixel size
    canvas.width = finalWidth * dpr;
    canvas.height = finalHeight * dpr;
    canvas.style.width = finalWidth + "px";
    canvas.style.height = finalHeight + "px";

    const context = canvas.getContext("2d");
    if (!context) return;

    // scale so 1 "unit" in code = 1 CSS pixel
    context.scale(dpr, dpr);
    context.imageSmoothingEnabled = false;
    ctx = context;

    // clear once
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

    // scale is in CSS pixels
    scale = finalWidth / totalWidthUnits;
  }

  // DRAWING FUNCTIONS
  function drawPianoKeys() {
    if (!ctx || !canvas) return;
    const c = ctx;

    const pianoHeight = canvasCssHeight * CONFIG.pianoHeightRatio;
    const startY = canvasCssHeight - pianoHeight;
    const active = getActiveKeys(currentTime);

    // figure out which keys to draw
    const totalWidthUnits = canvasCssWidth / scale;
    const renderedMinMidi = Math.max(0, Math.floor(leftOffset / 7) * 12);
    const renderedMaxMidi = Math.min(
      127,
      Math.ceil((leftOffset + totalWidthUnits) / 7) * 12
    );

    // white keys
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

    // black keys
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

    // label on white keys (smaller font)
    c.fillStyle = CONFIG.fontColor;
    c.font = "500 13px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";

    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (isBlackKey(midi)) continue;
      const x = getKeyX(midi);
      const w = getKeyWidth(midi);
      c.fillText(midiToNoteNameNoOctave(midi), x + w / 2, canvasCssHeight - 10);
    }
  }

  function drawNotes() {
    if (!ctx || !canvas) return;
    const c = ctx;

    // how far notes fall
    const pianoTopY =
      canvasCssHeight - canvasCssHeight * CONFIG.pianoHeightRatio;
    const speed = pianoTopY / CONFIG.visibleSeconds;

    // figure out which notes are visible
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

      // draw note name in center if there's enough space
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

    // clear the entire "CSS pixel" area
    ctx.clearRect(0, 0, canvasCssWidth, canvasCssHeight);

    if (!midiFile || allNotes.length === 0) return;

    untrack(() => {
      drawNotes();
      drawPianoKeys();
    });
  }

  // -- ANIMATION --
  function animate(timestamp: number) {
    if (!isPlaying || !ctx || !canvas) return;

    // Initialize animation start time
    if (animationStartTime === 0) {
      animationStartTime = timestamp - currentTime * 1000;
    }

    // Update time based on animation frame
    const newCurrentTime = (timestamp - animationStartTime) / 1000;

    // Sync with transport occasionally
    if (timestamp - lastTransportTime > 100) {
      const transportTime = untrack(() => Tone.getTransport().seconds);
      if (Math.abs(transportTime - newCurrentTime) > 0.1) {
        animationStartTime = timestamp - transportTime * 1000;
      }
      lastTransportTime = timestamp;
    }

    currentTime = newCurrentTime;
    if (currentTime >= totalDuration) {
      stopMidi();
      return;
    }

    drawAll();
    lastFrameTime = timestamp;

    animationFrameId = requestAnimationFrame(animate);
  }

  // -- PLAYBACK CONTROLS --
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

  function stopMidi() {
    isPlaying = false;
    isPaused = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    const transport = Tone.getTransport();
    transport.cancel(0);
    transport.stop();
    if (pianoSampler) {
      pianoSampler.releaseAll();
    }
    currentTime = 0;
    drawAll();
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

  // -- UI HANDLERS --
  function handleCanvasClick() {
    if (!isPlaying) {
      playMidi();
    } else {
      togglePauseResume();
    }
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

  function handleSliderChange(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    currentTime = val;
    if (val >= totalDuration) {
      stopMidi();
    } else {
      animationStartTime = performance.now() - val * 1000;
      Tone.getTransport().seconds = val;
      drawAll();
    }
  }

  // -- DERIVED VALUES --
  let currentTimeFormatted = $derived(formatTime(currentTime));
  let totalDurationFormatted = $derived(formatTime(totalDuration));

  // -- LIFECYCLE & EFFECTS --
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

  if (typeof window !== "undefined") {
    document.addEventListener("fullscreenchange", () => {
      isFullscreen = !!document.fullscreenElement;
    });
  }

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
            class="bg-green-500 hover:bg-green-600"
            size="icon-sm"
            disabled={isPlaying}
            onclick={playMidi}
          >
            <IconPlayerPlay />
          </Button>
          <Button
            size="icon-sm"
            variant="destructive"
            disabled={!isPlaying}
            onclick={stopMidi}
          >
            <IconPlayerStop />
          </Button>
          <Button
            size="icon-sm"
            disabled={!isPlaying}
            onclick={togglePauseResume}
          >
            {#if isPaused}
              <IconPlayerResume />
            {:else}
              <IconPlayerPause />
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
          onInput={handleSliderChange}
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
    <canvas bind:this={canvas} class="w-full" onclick={handleCanvasClick}
    ></canvas>
  </div>
</div>
