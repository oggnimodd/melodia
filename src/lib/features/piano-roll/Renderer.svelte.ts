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
  showLabels?: boolean;
  audioVisualOffset?: number;
  minMidi?: number;
  maxMidi?: number;
}

export interface PianoRollInitOptions {
  fullscreen: boolean;
  controlsDiv: HTMLDivElement | null;
  actualMinMidi?: number;
  actualMaxMidi?: number;
}

export class PianoRoll {
  // Reactive DOM element references
  canvas: HTMLCanvasElement | null = $state(null);
  containerDiv: HTMLDivElement | null = $state(null);
  ctx: CanvasRenderingContext2D | null = $state(null);

  // Reactive state variables
  scale = $state(1);
  leftOffset = $state(0);
  canvasCssWidth = $state(0);
  canvasCssHeight = $state(0);
  showLabels = $state(true);
  audioVisualOffset = $state(-0.1);
  allNotes: Notes = $state([]);
  minMidi = $state(24);
  maxMidi = $state(108);

  // Caches using SvelteMap for reactivity
  keyCache = new SvelteMap<number, { x: number; w: number }>();
  activeMidiTracks = new SvelteMap<number, number>();

  constructor({
    canvas,
    containerDiv,
    options,
  }: {
    canvas: HTMLCanvasElement;
    containerDiv: HTMLDivElement;
    options?: PianoRollOptions;
  }) {
    this.canvas = canvas;
    this.containerDiv = containerDiv;
    if (options?.showLabels !== undefined) this.showLabels = options.showLabels;
    if (options?.audioVisualOffset !== undefined)
      this.audioVisualOffset = options.audioVisualOffset;
    if (options?.minMidi !== undefined) this.minMidi = options.minMidi;
    if (options?.maxMidi !== undefined) this.maxMidi = options.maxMidi;
  }

  initCanvas({ fullscreen, controlsDiv }: PianoRollInitOptions) {
    if (!this.containerDiv || !this.canvas) return;

    // Get container dimensions
    const containerHeight = this.containerDiv.offsetHeight;
    const containerWidth = this.containerDiv.offsetWidth;
    let finalWidth = containerWidth;
    let finalHeight = fullscreen
      ? containerHeight - (controlsDiv?.offsetHeight || 0)
      : window.innerHeight * 0.7;
    if (finalHeight < 0) finalHeight = containerHeight;

    // Set canvas dimensions based on device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    this.canvasCssWidth = finalWidth;
    this.canvasCssHeight = finalHeight;
    this.canvas.width = finalWidth * dpr;
    this.canvas.height = finalHeight * dpr;
    this.canvas.style.width = finalWidth + "px";
    this.canvas.style.height = finalHeight + "px";

    // Get the 2D context and scale it for high-DPI screens
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    ctx.clearRect(0, 0, finalWidth, finalHeight);

    // If we have notes, recalc the note range and layout parameters
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

    // Update the key positions cache
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

    // Draw white keys
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

    // Draw black keys
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

    // Optionally, draw labels on white keys
    if (this.showLabels) {
      c.fillStyle = CONFIG.fontColor;
      const keyFontSize = pianoHeight * 0.15;
      c.font = "500 " + keyFontSize + "px sans-serif";
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
