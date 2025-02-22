<script lang="ts">
  import * as Tone from "tone";
  import { parseMidiFile } from "$lib/midi/parser";
  import Button from "$lib/components/ui/button/button.svelte";
  import { Input } from "$lib/components/ui/input";

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
  let currentTime = $state(0);
  let animationFrameId = $state<number | null>(null);

  // Will be updated after reading the MIDI
  let minMidi = $state(21);
  let maxMidi = $state(108);

  // We’ll measure layout by offsets, so we can scale them to fill the width
  let minOffset = $state(0);
  let maxOffset = $state(0);
  let scale = $state(1);
  let leftOffset = $state(0);

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

  function getOrCreateSampler(): Tone.Sampler {
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
    return pianoSampler;
  }

  function getOctaveLayout(midi: number) {
    return octaveLayout[midi % 12];
  }

  function getLayoutOffsetRaw(midi: number) {
    const noteOctave = Math.floor(midi / 12);
    return (noteOctave - 0) * 7 + getOctaveLayout(midi).offset;
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

  // Stop playback and reset state when a new file is chosen
  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      if (isPlaying) {
        stopMidi(); // Stop current playback if any
      }
      // Reset previous MIDI data
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
      } else {
        minMidi = 21;
        maxMidi = 108;
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

    const totalWidthUnits = maxOffset - minOffset + 1;
    scale = canvas.width / totalWidthUnits;
    leftOffset = minOffset;
  }

  function drawAll() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawNotes();
    drawPianoKeys();
  }

  function drawPianoKeys() {
    if (!ctx || !canvas) return;
    const c = ctx;
    const pianoHeight = CONFIG.pianoKeyHeight;
    const startY = canvas.height - pianoHeight;
    const active = getActiveKeys(currentTime);

    // Draw white keys
    for (let midi = minMidi; midi <= maxMidi; midi++) {
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
    for (let midi = minMidi; midi <= maxMidi; midi++) {
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

    // Draw key note labels on white keys
    c.fillStyle = CONFIG.fontColor;
    c.font = "bold 16px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (let midi = minMidi; midi <= maxMidi; midi++) {
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

  function animate() {
    if (!isPlaying || !ctx || !canvas) return;
    currentTime = Tone.getTransport().seconds;
    drawAll();
    animationFrameId = requestAnimationFrame(animate);
  }

  async function playMidi() {
    if (!allNotes.length) return;
    isPlaying = true;
    currentTime = 0;
    await Tone.start();
    const sampler = getOrCreateSampler();
    await Tone.loaded();

    const transport = Tone.getTransport();
    transport.cancel(0);
    transport.stop();

    for (let i = 0; i < allNotes.length; i++) {
      const n = allNotes[i];
      transport.schedule((time) => {
        sampler.triggerAttackRelease(n.name, n.duration, time);
      }, n.time);
    }
    transport.start();
    animate();
  }

  function stopMidi() {
    isPlaying = false;
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

  $effect(() => {
    initCanvas();
    const ro = new ResizeObserver(() => {
      initCanvas();
      drawAll();
    });
    if (containerDiv) ro.observe(containerDiv);

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
  <h1 class="mb-3 text-2xl font-semibold">Melodia</h1>

  <Input type="file" accept=".midi,.mid" onchange={handleFileChange} />

  <div class="mt-4 overflow-hidden rounded-lg border border-gray-700 bg-black">
    <canvas bind:this={canvas} class="w-full"></canvas>
  </div>

  {#if midiFile}
    <div class="mt-4 flex items-center gap-x-3">
      <Button disabled={isPlaying} onclick={playMidi}>Play MIDI</Button>
      <Button disabled={!isPlaying} onclick={stopMidi}>Stop</Button>
    </div>
  {/if}
</div>
