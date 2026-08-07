import { readonly, ref } from "vue";

const STORAGE_KEY = "proshock4.webhid.locale";
const DEFAULT_LOCALE = "en";
const TRANSLATED_ATTRIBUTES = ["aria-label", "placeholder", "title"];
const locale = ref(DEFAULT_LOCALE);
const localeRegistry = new Map();
const textState = new WeakMap();
const attributeState = new WeakMap();
let rootElement = null;
let observer = null;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileMessages(messages) {
  const exact = new Map();
  const patterns = [];
  Object.entries(messages).forEach(([source, translation]) => {
    const names = [...source.matchAll(/\{([a-zA-Z][\w]*)\}/g)].map((match) => match[1]);
    if (!names.length) {
      exact.set(source, translation);
      return;
    }
    let expression = escapeRegExp(source);
    names.forEach((name) => {
      expression = expression.replace(escapeRegExp(`{${name}}`), "(.+?)");
    });
    patterns.push({ names, translation, regex: new RegExp(`^${expression}$`) });
  });
  return { exact, patterns };
}

/**
 * Register a UI locale. A new language only needs a BCP 47 tag, its native
 * display name, and translations keyed by the canonical English UI copy.
 */
export function registerLocale(code, nativeName, messages = {}) {
  localeRegistry.set(code, { code, nativeName, ...compileMessages(messages) });
}

function resolveLocale(candidate) {
  if (localeRegistry.has(candidate)) return candidate;
  const language = String(candidate || "").split("-")[0].toLowerCase();
  return [...localeRegistry.keys()].find((code) => code.split("-")[0] === language)
    || DEFAULT_LOCALE;
}

export function translate(source, targetLocale = locale.value) {
  if (!source || targetLocale === DEFAULT_LOCALE) return source;
  const bundle = localeRegistry.get(targetLocale);
  if (!bundle) return source;
  const direct = bundle.exact.get(source);
  if (direct != null) return direct;
  for (const pattern of bundle.patterns) {
    const match = source.match(pattern.regex);
    if (!match) continue;
    return pattern.names.reduce(
      (result, name, index) => result.replaceAll(`{${name}}`, match[index + 1]),
      pattern.translation,
    );
  }
  return source;
}

function translateWhitespacePreserved(value) {
  const match = String(value).match(/^(\s*)(.*?)(\s*)$/s);
  if (!match || !match[2]) return value;
  return `${match[1]}${translate(match[2])}${match[3]}`;
}

function localizeTextNode(node) {
  if (node.parentElement?.closest("[data-i18n-ignore]")) return;
  let state = textState.get(node);
  if (!state || node.nodeValue !== state.rendered) {
    state = { source: node.nodeValue, rendered: node.nodeValue };
  }
  const rendered = translateWhitespacePreserved(state.source);
  textState.set(node, { source: state.source, rendered });
  if (node.nodeValue !== rendered) node.nodeValue = rendered;
}

function localizeAttributes(element) {
  if (element.closest("[data-i18n-ignore]")) return;
  const states = attributeState.get(element) || new Map();
  TRANSLATED_ATTRIBUTES.forEach((name) => {
    if (!element.hasAttribute(name)) return;
    const current = element.getAttribute(name);
    let state = states.get(name);
    if (!state || current !== state.rendered) state = { source: current, rendered: current };
    const rendered = translate(state.source);
    states.set(name, { source: state.source, rendered });
    if (current !== rendered) element.setAttribute(name, rendered);
  });
  attributeState.set(element, states);
}

function localizeTree(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    localizeTextNode(node);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.hasAttribute("data-i18n-ignore")) return;
  localizeAttributes(node);
  node.childNodes.forEach(localizeTree);
}

function applyLocale() {
  document.documentElement.lang = locale.value;
  document.title = translate("ProShock 4 WebHID Config");
  if (rootElement) localizeTree(rootElement);
}

export function setLocale(nextLocale) {
  locale.value = resolveLocale(nextLocale);
  try {
    window.localStorage.setItem(STORAGE_KEY, locale.value);
  } catch {
    // Storage may be unavailable in private mode; the live selection still works.
  }
  applyLocale();
}

/** Initialize from the persisted preference, then the browser language. */
export function initializeI18n() {
  let preferred = "";
  try {
    preferred = window.localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    preferred = "";
  }
  locale.value = resolveLocale(preferred || navigator.languages?.[0] || navigator.language);
  document.documentElement.lang = locale.value;
}

/** Keep Vue-rendered text and accessibility attributes synchronized to locale. */
export function mountI18n(root) {
  rootElement = root;
  applyLocale();
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") localizeTextNode(mutation.target);
      mutation.addedNodes.forEach(localizeTree);
      if (mutation.type === "attributes") localizeAttributes(mutation.target);
    });
  });
  observer.observe(rootElement, {
    attributes: true,
    attributeFilter: TRANSLATED_ATTRIBUTES,
    characterData: true,
    childList: true,
    subtree: true,
  });
}

export const currentLocale = readonly(locale);
export const availableLocales = () => [...localeRegistry.values()].map(({ code, nativeName }) => ({
  code,
  nativeName,
}));

registerLocale("en", "EN");
