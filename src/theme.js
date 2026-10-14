import { readonly, ref } from "vue";

const STORAGE_KEY = "proshock4.webhid.theme";
const theme = ref("dark");
export const currentTheme = readonly(theme);

/** @brief Apply a local appearance preference without changing device settings. */
export function setTheme(value) {
  theme.value = value === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme.value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.value === "light" ? "#f3f6fa" : "#080b10");
  try { window.localStorage.setItem(STORAGE_KEY, theme.value); } catch { /* Storage may be disabled. */ }
}

/** @brief Restore appearance before mounting the interface; keep dark as the default. */
export function initializeTheme() {
  let saved;
  try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* Use the default. */ }
  setTheme(saved);
}
