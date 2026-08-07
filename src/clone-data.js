/**
 * Clone the plain arrays, objects, and binary views used by WebHID config data.
 *
 * Property-by-property traversal intentionally unwraps Vue reactive proxies,
 * which cannot be passed directly to the browser structuredClone API.
 *
 * @param {*} value Config value to clone.
 * @returns {*} An independent non-reactive copy.
 */
export function cloneConfigData(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneConfigData(entry));
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }

  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      const buffer = value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength,
      );
      return new DataView(buffer);
    }
    return value.slice();
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneConfigData(entry)]),
  );
}
