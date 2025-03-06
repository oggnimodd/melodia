import type { MidiData } from "$lib/models/midi";
import type { Sampler } from "tone";

export const selectedMidi = $state({
  data: null as MidiData | null,
  file: null as File | null,
});

export let sampler = $state({
  instrument: null as Sampler | null,
});
