// This module uses IndexedDB to save MIDI files locally.

import type { MidiData } from "$lib/models/midi";
import { computeHash } from "$lib/utils/hash";

export interface StoredMidi {
  hash: string;
  fileName: string;
  data: MidiData;
  createdAt: number;
}

const DB_NAME = "midi-library";
const STORE_NAME = "midis";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "hash" });
        store.createIndex("fileName", "fileName", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMidi(storedMidi: StoredMidi): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(storedMidi);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function getAllMidis(): Promise<StoredMidi[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function deleteMidi(hash: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(hash);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function getMidiByHash(
  hash: string
): Promise<StoredMidi | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(hash);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function clearAllMidis(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// Auto-save a parsed MIDI file.
// After successfully parsing your MIDI file, call this function.
// It converts the MIDI data to JSON, computes a hash, checks if it exists, and then saves it.
export async function autoSaveMidi(
  midiFile: File,
  data: MidiData
): Promise<void> {
  try {
    const midiJson = JSON.stringify(data);
    const hash = await computeHash(midiJson);
    const existing = await getMidiByHash(hash);
    if (!existing) {
      await saveMidi({
        hash,
        fileName: midiFile.name,
        data,
        createdAt: Date.now(),
      });
    }
  } catch (e: any) {
    if (e.name === "QuotaExceededError") {
      alert(
        "Your storage is full. Auto-save is not working. Please delete some files from your MIDI library."
      );
    } else {
      console.error("Error auto-saving MIDI file:", e);
    }
  }
}
