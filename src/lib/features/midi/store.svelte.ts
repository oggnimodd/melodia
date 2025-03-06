import type { MidiData } from "$lib/models/midi";

export const selectedMidi = $state({
  data: null as MidiData | null,
  file: null as File | null,
});
