import * as Tone from "tone";

export const octaveLayout = [
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

export const CONFIG = {
  pianoHeightRatio: 0.15,
  blackKeyHeightRatio: 0.6,
  blackKeyWidthRatio: 0.6,
  whiteKeyColor: "#ffffff",
  blackKeyColor: "#000000",
  fontColor: "#000000",
};

// Returns the note name without octave information.
export function midiToNoteNameNoOctave(midi: number) {
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

export function getOctaveLayout(midi: number) {
  const index = ((midi % 12) + 12) % 12;
  return octaveLayout[index];
}

export function getLayoutOffsetRaw(midi: number) {
  const noteOctave = Math.floor(midi / 12);
  return noteOctave * 7 + getOctaveLayout(midi).offset;
}

export function getKeyX(midi: number, leftOffset: number, scale: number) {
  return (getLayoutOffsetRaw(midi) - leftOffset) * scale;
}

export function getKeyWidth(midi: number, scale: number) {
  return getOctaveLayout(midi).isBlack
    ? scale * CONFIG.blackKeyWidthRatio
    : scale;
}

export function isBlackKey(midi: number) {
  return getOctaveLayout(midi).isBlack;
}

export interface TrackColor {
  active: string;
  inactive?: string;
  activeBlack?: string;
}

export const TRACK_COLORS: TrackColor[] = [
  { active: "#4CAF50" },
  { active: "#2196F3" },
  { active: "#FFC107" },
  { active: "#E91E63" },
  { active: "#9C27B0" },
  { active: "#FF5722" },
  { active: "#00BCD4" },
  { active: "#8BC34A" },
];

// Convert a hex color to a less saturated version.
export function desaturateColor(hex: string, fraction: number): string {
  // Remove the '#' if present.
  let trimmed = hex.startsWith("#") ? hex.slice(1) : hex;
  // Expand shorthand (e.g. "abc" becomes "aabbcc")
  if (trimmed.length === 3) {
    trimmed = trimmed
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(trimmed.substring(0, 2), 16);
  const g = parseInt(trimmed.substring(2, 4), 16);
  const b = parseInt(trimmed.substring(4, 6), 16);

  // Convert RGB to HSL.
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rNorm) {
      h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / d + 2;
    } else {
      h = (rNorm - gNorm) / d + 4;
    }
    h /= 6;
  }

  // Reduce saturation by the given fraction.
  s = s * (1 - fraction);

  // Convert HSL back to RGB.
  function hue2rgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  let rNew: number, gNew: number, bNew: number;
  if (s === 0) {
    rNew = gNew = bNew = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rNew = hue2rgb(p, q, h + 1 / 3);
    gNew = hue2rgb(p, q, h);
    bNew = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (val: number) =>
    Math.round(val * 255)
      .toString(16)
      .padStart(2, "0");
  return "#" + toHex(rNew) + toHex(gNew) + toHex(bNew);
}

// Precompute the desaturated color for black keys on startup.
TRACK_COLORS.forEach((track) => {
  track.activeBlack = desaturateColor(track.active, 0.45);
});

// Adjusted getTrackColor using the precomputed activeBlack value.
export function getTrackColor(
  track: number,
  active: boolean = true,
  isBlack: boolean = false
): string {
  const index = track % TRACK_COLORS.length;
  const color = TRACK_COLORS[index];
  if (active) {
    return isBlack ? color.activeBlack! : color.active;
  } else {
    return isBlack ? CONFIG.blackKeyColor : CONFIG.whiteKeyColor;
  }
}

export function createSalamanderPiano() {
  return new Tone.Sampler({
    urls: {
      A0: "A0.mp3",
      C1: "C1.mp3",
      "D#1": "Ds1.mp3",
      "F#1": "Fs1.mp3",
      A1: "A1.mp3",
      C2: "C2.mp3",
      "D#2": "Ds2.mp3",
      "F#2": "Fs2.mp3",
      A2: "A2.mp3",
      C3: "C3.mp3",
      "D#3": "Ds3.mp3",
      "F#3": "Fs3.mp3",
      A3: "A3.mp3",
      C4: "C4.mp3",
      "D#4": "Ds4.mp3",
      "F#4": "Fs4.mp3",
      A4: "A4.mp3",
      C5: "C5.mp3",
      "D#5": "Ds5.mp3",
      "F#5": "Fs5.mp3",
      A5: "A5.mp3",
      C6: "C6.mp3",
      "D#6": "Ds6.mp3",
      "F#6": "Fs6.mp3",
      A6: "A6.mp3",
      C7: "C7.mp3",
      "D#7": "Ds7.mp3",
      "F#7": "Fs7.mp3",
      A7: "A7.mp3",
      C8: "C8.mp3",
    },
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    attack: 0.02,
    release: 1.5,
  }).toDestination();
}
