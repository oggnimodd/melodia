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
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import {
  DEFAULT_VISUAL_OFFSET,
  DEFAULT_SHOW_LABELS,
  DEFAULT_VISIBLE_SECONDS,
} from "./config";
import LocalStorageManager from "$lib/utils/local-storage";

export interface PianoRollOptions {
  minMidi?: number;
  maxMidi?: number;
}

export interface PianoRollInitOptions {
  fullscreen: boolean;
  controlsDiv: HTMLDivElement | null;
}

export class PianoRoll {
  // Load config directly from localStorage.
  showLabels = $state(LocalStorageManager.get("showLabels"));
  showOctaveLines = $state(LocalStorageManager.get("showOctaveLines"));
  audioVisualOffset = $state(LocalStorageManager.get("audioVisualOffset"));
  visibleSeconds = $state(LocalStorageManager.get("visibleSeconds"));
  minMidi = $state(24);
  maxMidi = $state(108);

  // Customizable octave line properties.
  octaveLineColor = $state("rgba(255, 255, 255, 0.45)");
  octaveLineWidth = $state(0.5);

  // DOM-dependent properties (set later in onMount).
  canvas: HTMLCanvasElement | null = $state(null);
  containerDiv: HTMLDivElement | null = $state(null);
  ctx: CanvasRenderingContext2D | null = $state(null);

  // Internal layout and note state.
  scale = $state(1);
  leftOffset = $state(0);
  canvasCssWidth = $state(0);
  canvasCssHeight = $state(0);
  allNotes: Notes = $state([]);

  // Note layout cache.
  keyCache = new SvelteMap<number, { x: number; w: number }>();

  // Active note state for rendering.
  activeMidiTracks = $state(new SvelteMap<number, number>());
  activeNotes = $state(new SvelteSet<number>());

  constructor(options: PianoRollOptions = {}) {
    this.minMidi = options.minMidi ?? this.minMidi;
    this.maxMidi = options.maxMidi ?? this.maxMidi;
  }

  // Update each config property in localStorage.
  private updateConfigStorage() {
    LocalStorageManager.set("showLabels", this.showLabels);
    LocalStorageManager.set("showOctaveLines", this.showOctaveLines);
    LocalStorageManager.set("audioVisualOffset", this.audioVisualOffset);
    LocalStorageManager.set("visibleSeconds", this.visibleSeconds);
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
    if (this.allNotes.length > 0) {
      // Standard piano range (88 keys)
      const standardMinMidi = 21; // A0
      const standardMaxMidi = 108; // C8

      // Get the actual min and max MIDI numbers from the loaded notes.
      const actualMinMidi = Math.min(...this.allNotes.map((n) => n.midi));
      const actualMaxMidi = Math.max(...this.allNotes.map((n) => n.midi));

      // Choose the lower bound as the lower of standard and actual (in case your piece has lower notes)
      // and the upper bound as the higher of standard and actual.
      let newMinMidi = Math.min(standardMinMidi, actualMinMidi);
      let newMaxMidi = Math.max(standardMaxMidi, actualMaxMidi);

      const extraWhiteKeys = 3;
      const extraSemitones = Math.ceil((extraWhiteKeys * 12) / 7);
      newMinMidi = Math.max(0, newMinMidi - extraSemitones);
      newMaxMidi = Math.min(127, newMaxMidi + extraSemitones);

      // Calculate the layout offsets and scale based on the computed range.
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
    this.updateConfigStorage();
  }

  setShowLabels(val: boolean) {
    this.showLabels = val;
    this.updateConfigStorage();
  }

  setShowOctaveLines(val: boolean) {
    this.showOctaveLines = val;
    this.updateConfigStorage();
  }

  setVisibleSeconds(val: number) {
    this.visibleSeconds = val;
    this.updateConfigStorage();
  }

  resetAudioVisualOffset() {
    this.audioVisualOffset = DEFAULT_VISUAL_OFFSET;
    this.updateConfigStorage();
  }

  resetShowLabels() {
    this.showLabels = DEFAULT_SHOW_LABELS;
    this.updateConfigStorage();
  }

  resetVisibleSeconds() {
    this.visibleSeconds = DEFAULT_VISIBLE_SECONDS;
    this.updateConfigStorage();
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
    const speed = pianoTopY / this.visibleSeconds;
    const visibleStart = currentTime - this.visibleSeconds;
    const visibleEnd = currentTime + this.visibleSeconds;
    const startIdx = this.allNotes.findIndex(
      (n) => n.time + this.audioVisualOffset + n.duration >= visibleStart
    );
    if (startIdx === -1) return;
    for (let i = startIdx; i < this.allNotes.length; i++) {
      const note = this.allNotes[i];
      if (note.time + this.audioVisualOffset > visibleEnd) break;
      const appearTime =
        note.time + this.audioVisualOffset - this.visibleSeconds;
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
      if (this.showLabels && noteHeight > 15 && !isBlackKey(note.midi)) {
        c.fillStyle = "#fff";
        c.font = "bold 13.5px sans-serif";
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

  drawOctaveLines() {
    if (!this.ctx) return;
    if (!this.showOctaveLines) return;
    this.ctx.save();
    this.ctx.strokeStyle = this.octaveLineColor;
    this.ctx.lineWidth = this.octaveLineWidth;
    // Draw vertical lines at every C note (MIDI % 12 === 0)
    for (let midi = 0; midi <= 127; midi += 12) {
      const key = this.keyCache.get(midi);
      if (!key) continue;
      const x = key.x;
      if (x < 0 || x > this.canvasCssWidth) continue;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvasCssHeight);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawAll(currentTime: number) {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvasCssWidth, this.canvasCssHeight);
    if (!this.allNotes.length) return;
    this.drawOctaveLines();
    this.drawNotes(currentTime);
    this.drawPianoKeys();
  }

  updateActiveNotes(currentTime: number, allNotes: Notes) {
    this.activeNotes.clear();
    this.activeMidiTracks.clear();
    const offset = this.audioVisualOffset;
    for (const note of allNotes) {
      const activationTime = note.time + offset;
      const deactivationTime = note.time + note.duration + offset;
      if (currentTime >= activationTime && currentTime <= deactivationTime) {
        this.activeNotes.add(note.id);
        this.activeMidiTracks.set(note.midi, note.track);
      }
    }
  }

  clearCache() {
    this.keyCache.clear();
    this.activeMidiTracks.clear();
    this.activeNotes.clear();
  }
}
