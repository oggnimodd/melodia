import { browser } from "$app/environment";
import { z } from "zod";
import {
  DEFAULT_VISUAL_OFFSET,
  DEFAULT_SHOW_LABELS,
  DEFAULT_VISIBLE_SECONDS,
  DEFAULT_SHOW_OCTAVE_LINES,
} from "$lib/features/piano-roll";

// Define each key separately.
const schemas = {
  showLabels: z.boolean(),
  showOctaveLines: z.boolean(),
  audioVisualOffset: z.number(),
  visibleSeconds: z.number(),
} as const;

export type LocalStorageKey = keyof typeof schemas;
export type LocalStorageSchema = {
  [K in LocalStorageKey]: z.infer<(typeof schemas)[K]>;
};

// Explicitly type defaults as LocalStorageSchema.
const defaults: LocalStorageSchema = {
  showLabels: DEFAULT_SHOW_LABELS,
  showOctaveLines: DEFAULT_SHOW_OCTAVE_LINES,
  audioVisualOffset: DEFAULT_VISUAL_OFFSET,
  visibleSeconds: DEFAULT_VISIBLE_SECONDS,
};

/**
 * Provides type-safe access to localStorage using Zod for runtime validation.
 */
class LocalStorageManager {
  static get<K extends LocalStorageKey>(
    key: K,
    options?: { defaultValue?: LocalStorageSchema[K] }
  ): LocalStorageSchema[K] {
    if (!browser) {
      return options?.defaultValue ?? defaults[key];
    }

    try {
      const storedItem = localStorage.getItem(key);
      if (!storedItem) {
        return options?.defaultValue ?? defaults[key];
      }
      const parsedItem = JSON.parse(storedItem);
      const result = schemas[key].safeParse(parsedItem);
      if (!result.success) {
        console.warn(
          `Invalid value in localStorage for key "${key}". Resetting to default.`,
          result.error
        );
        this.set(key, options?.defaultValue ?? defaults[key]);
        return options?.defaultValue ?? defaults[key];
      }
      return result.data as LocalStorageSchema[K];
    } catch (error) {
      console.warn(
        `Error reading from localStorage for key "${key}". Returning default value.`,
        error
      );
      return options?.defaultValue ?? defaults[key];
    }
  }

  static set<K extends LocalStorageKey>(
    key: K,
    value: LocalStorageSchema[K]
  ): boolean {
    if (!browser) {
      return false;
    }

    try {
      const validationResult = schemas[key].safeParse(value);
      if (!validationResult.success) {
        console.error(
          `Invalid value provided for key "${key}":`,
          validationResult.error
        );
        return false;
      }
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error saving to localStorage for key "${key}":`, error);
      return false;
    }
  }

  static remove(key: LocalStorageKey): boolean {
    if (!browser) {
      return false;
    }

    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing key "${key}" from localStorage:`, error);
      return false;
    }
  }

  static clear(): boolean {
    if (!browser) {
      return false;
    }

    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error("Error clearing localStorage:", error);
      return false;
    }
  }
}

export default LocalStorageManager;
