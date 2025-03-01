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
  visibleSeconds: 3,
  whiteKeyColor: "#ffffff",
  blackKeyColor: "#000000",
  activeWhiteKeyColor: "#2196F3",
  activeBlackKeyColor: "#2196F3",
  inactiveNoteColor: "#2196F3",
  activeNoteColor: "#2196F3",
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
  return octaveLayout[midi % 12];
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
  // Optionally you can add an inactive color here
  inactive?: string;
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

export function getTrackColor(track: number, active: boolean = true): string {
  const index = track % TRACK_COLORS.length;
  // For now we return the active color regardless
  return TRACK_COLORS[index].active;
}
