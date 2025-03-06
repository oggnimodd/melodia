import type { parseMidiFile } from "$lib/features/midi";

interface Note {
  time: number;
  duration: number;
  midi: number;
  name: string;
  id: number;
  track: number;
  velocity?: number;
  hasLogged?: boolean;
}

export type Notes = Note[];

export type MidiData = Awaited<ReturnType<typeof parseMidiFile>>;
