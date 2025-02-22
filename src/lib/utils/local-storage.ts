import { browser } from "$app/environment";
import { apiKeysSchema } from "$lib/models/api-key";
import type { z } from "zod";

const schemas = {
  apiKeys: apiKeysSchema,
} as const;

// Default values that match the schema exactly.
const defaults = {
  apiKeys: {
    GEMINI_API_KEY: "",
    MISTRAL_API_KEY: "",
    GROQ_API_KEY: "",
  },
} as const;

export type LocalStorageKey = keyof typeof schemas; // Only 'apiKeys' in this example
export type LocalStorageSchema = {
  [K in LocalStorageKey]: z.infer<(typeof schemas)[K]>;
};

/**
 * Provides type-safe access to localStorage using Zod for runtime validation.
 */

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
class LocalStorageManager {
  /**
   * Reads a value from localStorage.
   * If the key doesn't exist or the value is invalid, returns the default.
   */
  static get<K extends LocalStorageKey>(
    key: K,
    options?: { defaultValue?: LocalStorageSchema[K] }
  ): LocalStorageSchema[K] {
    if (!browser) {
      console.warn(
        "LocalStorageManager.get called on the server. Returning default value."
      );
      return options?.defaultValue ?? defaults[key];
    }

    try {
      const storedItem = localStorage.getItem(key);
      if (!storedItem) {
        // No stored value, so use default.
        return options?.defaultValue ?? defaults[key];
      }
      const parsedItem = JSON.parse(storedItem);
      const result = schemas[key].safeParse(parsedItem);

      if (!result.success) {
        console.warn(
          `Invalid value in localStorage for key "${key}". Resetting to default.`,
          result.error
        );
        // Save default if the stored value is invalid.
        // biome-ignore lint/complexity/noThisInStatic: <explanation>
        this.set(key, options?.defaultValue ?? defaults[key]);
        return options?.defaultValue ?? defaults[key];
      }

      return result.data;
    } catch (error) {
      console.warn(
        `Error reading from localStorage for key "${key}". Returning default value.`,
        error
      );
      return options?.defaultValue ?? defaults[key];
    }
  }

  /**
   * Validates and writes a value to localStorage.
   */
  static set<K extends LocalStorageKey>(
    key: K,
    value: LocalStorageSchema[K]
  ): boolean {
    if (!browser) {
      console.warn(
        "LocalStorageManager.set called on the server. No action taken."
      );
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

      // Store the validated value directly.
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error saving to localStorage for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Removes a key from localStorage.
   */
  static remove(key: LocalStorageKey): boolean {
    if (!browser) {
      console.warn(
        "LocalStorageManager.remove called on the server. No action taken."
      );
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

  /**
   * Clears all keys from localStorage.
   */
  static clear(): boolean {
    if (!browser) {
      console.warn(
        "LocalStorageManager.clear called on the server. No action taken."
      );
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
