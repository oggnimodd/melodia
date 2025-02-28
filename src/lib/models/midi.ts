interface Note {
  time: number;
  duration: number;
  midi: number;
  name: string;
  id: number;
  hasLogged?: boolean;
}

export type Notes = Note[];
