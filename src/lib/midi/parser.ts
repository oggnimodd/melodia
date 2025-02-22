export async function parseMidiFile(file: File) {
  // Dynamically import the module
  const { Midi } = await import('@tonejs/midi');
  
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);
  
  const midiData = {
    header: {
      keySignatures: midi.header.keySignatures.map((ks) => ({
        key: ks.key,
        scale: ks.scale,
        ticks: ks.ticks,
      })),
      meta: midi.header.meta || [],
      name: midi.header.name || "",
      ppq: midi.header.ppq,
      tempos: midi.header.tempos.map((tempo) => ({
        bpm: tempo.bpm,
        ticks: tempo.ticks,
      })),
      timeSignatures: midi.header.timeSignatures.map((ts) => ({
        ticks: ts.ticks,
        timeSignature: ts.timeSignature,
        measures: ts.measures,
      })),
    },
    tracks: midi.tracks.map((track) => ({
      channel: track.channel,
      controlChanges: Object.fromEntries(
        Object.entries(track.controlChanges).map(([key, changes]) => [
          key,
          changes.map((change) => ({
            number: change.number,
            ticks: change.ticks,
            time: change.time,
            value: change.value,
          })),
        ])
      ),
      pitchBends: track.pitchBends,
      instrument: {
        family: track.instrument.family,
        number: track.instrument.number,
        name: track.instrument.name,
      },
      name: track.name,
      notes: track.notes.map((note) => ({
        duration: note.duration,
        durationTicks: note.durationTicks,
        midi: note.midi,
        name: note.name,
        ticks: note.ticks,
        time: note.time,
        velocity: note.velocity,
      })),
    })),
  };
  
  return midiData;
}