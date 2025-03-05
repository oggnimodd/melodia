// Renderer.svelte.ts
import {
  CONFIG,
  midiToNoteNameNoOctave,
  isBlackKey,
  getTrackColor,
  getKeyX,
  getKeyWidth,
  getLayoutOffsetRaw,
} from "$lib/utils/piano";
import type { Notes } from "$lib/models/midi";
import { SvelteMap } from "svelte/reactivity";

export interface PianoRollOptions {
  minMidi?: number;
  maxMidi?: number;
}

export interface PianoRollInitOptions {
  fullscreen: boolean;
  controlsDiv: HTMLDivElement | null;
}

const DEFAULT_VISUAL_OFFSET = -0.1;
const DEFAULT_SHOW_LABELS = true;

export class PianoRoll {
  // Configuration options available immediately.
  showLabels = $state(DEFAULT_SHOW_LABELS);
  audioVisualOffset = $state(DEFAULT_VISUAL_OFFSET);
  minMidi = $state(24);
  maxMidi = $state(108);

  // DOM-dependent properties (set later in onMount).
  canvas: HTMLCanvasElement | null = $state(null);
  containerDiv: HTMLDivElement | null = $state(null);
  ctx: CanvasRenderingContext2D | null = $state(null);

  // Internal layout and note state.
  scale = $state(1);
  leftOffset = $state(0);
  canvasCssWidth = $state(0);
  canvasCssHeight = $state(0);
  allNotes: Notes = $state([]); // Assume an array of note objects.

  keyCache = new SvelteMap<number, { x: number; w: number }>();
  activeMidiTracks = new SvelteMap<number, number>();

  constructor(options: PianoRollOptions = {}) {
    this.minMidi = options.minMidi ?? this.minMidi;
    this.maxMidi = options.maxMidi ?? this.maxMidi;
  }

  /**
   * Set the canvas and container elements once they are available.
   */
  setElements(params: {
    canvas: HTMLCanvasElement;
    containerDiv: HTMLDivElement;
  }) {
    this.canvas = params.canvas;
    this.containerDiv = params.containerDiv;
  }

  /**
   * Initialize the canvas layout. This must be called after the DOM elements are set.
   */
  initCanvas({ fullscreen, controlsDiv }: PianoRollInitOptions) {
    if (!this.containerDiv || !this.canvas) return;

    const containerHeight = this.containerDiv.offsetHeight;
    const containerWidth = this.containerDiv.offsetWidth;
    const finalWidth = containerWidth;
    let finalHeight = fullscreen
      ? containerHeight - (controlsDiv?.offsetHeight || 0)
      : window.innerHeight * 0.7;
    if (finalHeight < 0) finalHeight = containerHeight;

    // Set canvas dimensions based on device pixel ratio.
    const dpr = window.devicePixelRatio || 1;
    this.canvasCssWidth = finalWidth;
    this.canvasCssHeight = finalHeight;
    this.canvas.width = finalWidth * dpr;
    this.canvas.height = finalHeight * dpr;
    this.canvas.style.width = `${finalWidth}px`;
    this.canvas.style.height = `${finalHeight}px`;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    ctx.clearRect(0, 0, finalWidth, finalHeight);

    // Recalculate note layout if we have note data.
    if (this.allNotes.length > 0) {
      const actualMinMidi = Math.min(...this.allNotes.map((n) => n.midi));
      const actualMaxMidi = Math.max(...this.allNotes.map((n) => n.midi));
      const center = (actualMinMidi + actualMaxMidi) / 2;
      const actualOctaves = Math.ceil((actualMaxMidi - actualMinMidi + 1) / 12);
      const renderedOctaves = Math.max(actualOctaves, 6);
      const renderedSemitones = renderedOctaves * 12;
      let newMinMidi = Math.floor((center - renderedSemitones / 2) / 12) * 12;
      let newMaxMidi = newMinMidi + renderedSemitones - 1;
      if (newMinMidi > actualMinMidi) {
        newMinMidi = Math.floor(actualMinMidi / 12) * 12;
        newMaxMidi = newMinMidi + renderedSemitones - 1;
      }
      if (newMaxMidi < actualMaxMidi) {
        newMaxMidi = Math.ceil((actualMaxMidi + 1) / 12) * 12 - 1;
        newMinMidi = newMaxMidi - renderedSemitones + 1;
      }
      const extraWhiteKeys = 3;
      const extraSemitones = Math.ceil((extraWhiteKeys * 12) / 7);
      newMaxMidi += extraSemitones;
      this.leftOffset = getLayoutOffsetRaw(newMinMidi);
      const maxOffset = getLayoutOffsetRaw(newMaxMidi);
      this.scale = finalWidth / (maxOffset - this.leftOffset);
    }
    this.updateKeyCache();
  }

  updateKeyCache() {
    this.keyCache.clear();
    for (let midi = 0; midi < 128; midi++) {
      this.keyCache.set(midi, {
        x: getKeyX(midi, this.leftOffset, this.scale),
        w: getKeyWidth(midi, this.scale),
      });
    }
  }

  setAudioVisualOffset(val: number) {
    this.audioVisualOffset = val;
  }

  setShowLabels(val: boolean) {
    this.showLabels = val;
  }

  resetAudioVisualOffset() {
    this.audioVisualOffset = DEFAULT_VISUAL_OFFSET;
  }

  resetShowLabels() {
    this.showLabels = DEFAULT_SHOW_LABELS;
  }

  drawPianoKeys() {
    if (!this.ctx) return;
    const c = this.ctx;
    const pianoHeight = this.canvasCssHeight * CONFIG.pianoHeightRatio;
    const startY = this.canvasCssHeight - pianoHeight;
    const totalWidthUnits = this.canvasCssWidth / this.scale;
    const renderedMinMidi = Math.max(0, Math.floor(this.leftOffset / 7) * 12);
    const renderedMaxMidi = Math.min(
      127,
      Math.ceil((this.leftOffset + totalWidthUnits) / 7) * 12
    );

    // Draw white keys.
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (isBlackKey(midi)) continue;
      const key = this.keyCache.get(midi);
      if (!key) continue;
      const { x, w } = key;
      const track = this.activeMidiTracks.get(midi);
      const fillColor =
        track !== undefined
          ? getTrackColor(track, true, false)
          : CONFIG.whiteKeyColor;
      c.fillStyle = fillColor;
      c.fillRect(x, startY, w, pianoHeight);
      c.strokeStyle = "#000";
      c.strokeRect(x, startY, w, pianoHeight);
    }

    // Draw black keys.
    for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
      if (!isBlackKey(midi)) continue;
      const key = this.keyCache.get(midi);
      if (!key) continue;
      const { x, w } = key;
      const h = pianoHeight * CONFIG.blackKeyHeightRatio;
      const track = this.activeMidiTracks.get(midi);
      const fillColor =
        track !== undefined
          ? getTrackColor(track, true, true)
          : CONFIG.blackKeyColor;
      c.fillStyle = fillColor;
      c.fillRect(x, startY, w, h);
    }

    // Optionally, draw labels.
    if (this.showLabels) {
      c.fillStyle = CONFIG.fontColor;
      const keyFontSize = pianoHeight * 0.15;
      c.font = `500 ${keyFontSize}px sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      const keyYOffset = pianoHeight * 0.11;
      for (let midi = renderedMinMidi; midi <= renderedMaxMidi; midi++) {
        if (isBlackKey(midi)) continue;
        const key = this.keyCache.get(midi);
        if (!key) continue;
        const { x, w } = key;
        c.fillText(
          midiToNoteNameNoOctave(midi),
          x + w / 2,
          this.canvasCssHeight - keyYOffset
        );
      }
    }
  }

  drawNotes(currentTime: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const pianoTopY =
      this.canvasCssHeight - this.canvasCssHeight * CONFIG.pianoHeightRatio;
    const speed = pianoTopY / CONFIG.visibleSeconds;
    const visibleStart = currentTime - CONFIG.visibleSeconds;
    const visibleEnd = currentTime + CONFIG.visibleSeconds;
    const startIdx = this.allNotes.findIndex(
      (n) => n.time + this.audioVisualOffset + n.duration >= visibleStart
    );
    if (startIdx === -1) return;
    for (let i = startIdx; i < this.allNotes.length; i++) {
      const note = this.allNotes[i];
      if (note.time + this.audioVisualOffset > visibleEnd) break;
      const appearTime =
        note.time + this.audioVisualOffset - CONFIG.visibleSeconds;
      const timeSinceAppear = currentTime - appearTime;
      const bottomY = timeSinceAppear * speed;
      const noteHeight = note.duration * speed;
      const topY = bottomY - noteHeight;
      const key = this.keyCache.get(note.midi);
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
      if (this.showLabels && noteHeight > 15) {
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

  drawAll(currentTime: number) {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvasCssWidth, this.canvasCssHeight);
    if (!this.allNotes.length) return;
    this.drawNotes(currentTime);
    this.drawPianoKeys();
  }
}
