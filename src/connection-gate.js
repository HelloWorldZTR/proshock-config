/** Derive page access without treating development preview as a device session. */
export function isConnectionBlocked({ page, connected, development, dismissed }) {
  if (page === "home" || page === "firmware") return false;
  if (development && dismissed) return false;
  return !connected;
}
