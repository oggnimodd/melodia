<script lang="ts">
  import * as Tone from "tone";
  import { parseMidiFile } from "$lib/midi/parser";
  import Button from "$lib/components/ui/button/button.svelte";
  import Slider from "$lib/components/ui/slider/slider.svelte";
  import { Input } from "$lib/components/ui/input";

  // -- REACTIVE STATES (Svelte 5 runes) --
  let containerDiv = $state<HTMLDivElement | null>(null);
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
  let currentTime = $state(0);
  let animationFrameId = $state<number | null>(null);
  let minMidi = $state(21);
  let maxMidi = $state(108);
  let minOffset = $state(0);
  let maxOffset = $state(0);
  let scale = $state(1);
  let leftOffset = $state(0);
  let totalDuration = $derived(midiData?.totalDuration || 0);

  // Each entry describes how to place white/black keys in one octave
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

  // Drawing/animation config
  const CONFIG = {
    pianoKeyHeight: 120,
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
    for (let i = 0; i < allNotes.length; i++) {
      const note = allNotes[i];
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
        stopMidi();
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
        let trackMin = 9999;
        let trackMax = 0;
        for (const n of allNotes) {
          if (n.midi < trackMin) trackMin = n.midi;
          if (n.midi > trackMax) trackMax = n.midi;
        }
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
    canvas.width = containerDiv.offsetWidth;
    canvas.height = window.innerHeight * 0.7;
    const context = canvas.getContext("2d");
    if (!context) return;
    ctx = context;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    scale = canvas.width / totalWidthUnits;
  }
  function drawPianoKeys() {
    if (!ctx || !canvas) return;
    const c = ctx;
    const pianoHeight = CONFIG.pianoKeyHeight;
    const startY = canvas.height - pianoHeight;
    const active = getActiveKeys(currentTime);
    const totalWidthUnits = canvas.width / scale;
    let renderedMinMidi = 0;
    for (let m = 0; m <= 127; m++) {
      if (getLayoutOffsetRaw(m) >= leftOffset) {
        renderedMinMidi = m;
        break;
      }
    }
    let renderedMaxMidi = 127;
    for (let m = 127; m >= 0; m--) {
      if (getLayoutOffsetRaw(m) <= leftOffset + totalWidthUnits) {
        renderedMaxMidi = m;
        break;
      }
    }
    // Draw white keys
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
    // Draw black keys
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
    // Draw note labels on white keys
    c.fillStyle = CONFIG.fontColor;
    c.font = "bold 16px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (isBlackKey(midi)) continue;
      const x = getKeyX(midi);
      const w = getKeyWidth(midi);
      c.fillText(midiToNoteNameNoOctave(midi), x + w / 2, canvas.height - 10);
    }
  }
  function drawNotes() {
    if (!ctx || !canvas) return;
    const c = ctx;
    const pianoTopY = canvas.height - CONFIG.pianoKeyHeight;
    const speed = pianoTopY / CONFIG.visibleSeconds;
    for (let i = 0; i < allNotes.length; i++) {
      const note = allNotes[i];
      const appearTime = note.time - CONFIG.visibleSeconds;
      const disappearTime = note.time + note.duration + CONFIG.visibleSeconds;
      if (disappearTime < currentTime || appearTime > currentTime) continue;
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
      c.fillStyle = "#fff";
      c.font = "10px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(
        midiToNoteNameNoOctave(note.midi),
        x + w / 2,
        topY + noteHeight / 2
      );
    }
  }
  function drawAll() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!midiFile || allNotes.length === 0) {
      return;
    }
    drawNotes();
    drawPianoKeys();
  }
  function animate() {
    if (!isPlaying || !ctx || !canvas) return;
    currentTime = Tone.getTransport().seconds;
    if (currentTime >= totalDuration) {
      stopMidi();
      return;
    }
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
    for (let i = 0; i < allNotes.length; i++) {
      const n = allNotes[i];
      transport.schedule((time) => {
        pianoSampler!.triggerAttackRelease(n.name, n.duration, time);
      }, n.time);
    }
    transport.start();
    animate();
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
      // Pause the transport and stop the animation loop.
      Tone.getTransport().pause();
      isPaused = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    } else {
      // Resume the transport from the current time.
      Tone.getTransport().start(undefined, currentTime);
      isPaused = false;
      animate();
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

  function handleSliderChange(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    currentTime = val;
    if (val >= totalDuration) {
      stopMidi();
    } else {
      Tone.getTransport().seconds = val;
      drawAll();
    }
  }

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
  $effect(() => {
    return () => {
      if (pianoSampler) pianoSampler.dispose();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel(0);
      isPlaying = false;
    };
  });
</script>

<div class="mx-auto max-w-5xl px-4 py-8" bind:this={containerDiv}>
  <h1 class="mb-3 text-2xl font-semibold text-white">Melodia</h1>
  <Input type="file" accept=".midi,.mid" onchange={handleFileChange} />
  {#if allNotes.length > 0}
    <div class="mt-4 flex items-center justify-center gap-4 text-white">
      {#if midiFile}
        <div class="mt-4 flex items-center gap-x-3">
          <Button disabled={isPlaying} onclick={playMidi}>Play MIDI</Button>
          <Button disabled={!isPlaying} onclick={stopMidi}>Stop</Button>
          <Button disabled={!isPlaying} onclick={togglePauseResume}>
            {isPaused ? "Resume" : "Pause"}
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
  <div class="mt-4 overflow-hidden rounded-lg border border-gray-700 bg-black">
    <canvas bind:this={canvas} class="w-full"></canvas>
  </div>
</div>
