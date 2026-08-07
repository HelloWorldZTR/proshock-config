export const CONFIG_SESSION_WARNING_STORAGE_KEY =
  "proshock4.config-session-warning.suppressed";

function defaultStorage() {
  try {
    return globalThis.window?.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * Keep the Configuration Mode warning preference outside the Vue view layer.
 */
export function createConfigSessionWarningStore(storage = defaultStorage()) {
  let suppressed = false;

  try {
    suppressed = storage?.getItem(CONFIG_SESSION_WARNING_STORAGE_KEY) === "1";
  } catch {
    suppressed = false;
  }

  return {
    shouldShow() {
      return !suppressed;
    },
    acknowledge(suppressFutureWarnings = false) {
      if (!suppressFutureWarnings) {
        return;
      }
      suppressed = true;
      try {
        storage?.setItem(CONFIG_SESSION_WARNING_STORAGE_KEY, "1");
      } catch {
        // Keep the in-memory preference when browser storage is unavailable.
      }
    },
  };
}

export const configSessionWarningStore = createConfigSessionWarningStore();
