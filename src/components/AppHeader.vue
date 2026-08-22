<template>
  <header ref="headerRoot" class="app-header" data-testid="app-header">
    <div class="profile-quick-switch">
      <button
        ref="profileTrigger"
        type="button"
        class="profile-quick-trigger"
        :disabled="!connected || busy || profileSwitchBlocked"
        :title="profileSwitchBlocked ? 'Save before switching Profiles' : 'Switch active Profile'"
        aria-haspopup="menu"
        :aria-expanded="profileOpen"
        aria-label="Switch active Profile"
        @click="toggleProfileMenu"
      >
        <i :style="{ background: selectedColor }"></i>
        <span class="profile-slot-full">Slot {{ selected + 1 }}</span>
        <span class="profile-slot-short">S{{ selected + 1 }}</span>
        <ChevronDown class="header-chevron" />
      </button>
      <div v-if="profileOpen" class="profile-quick-menu" role="menu">
        <button
          v-for="profile in profiles"
          :key="profile.index"
          type="button"
          role="menuitem"
          :class="{ selected: profile.index === selected }"
          @click="selectProfile(profile.index)"
        >
          <i :style="{ background: profile.hex }"></i>
          <span>
            <strong>Slot {{ profile.index + 1 }}</strong>
            <small>{{ profile.index === active ? "Active Profile" : "Profile" }}</small>
          </span>
          <span class="profile-quick-badges">
            <b v-if="profile.index === active">Active</b>
            <b v-if="profile.index === boot" class="boot">Boot</b>
            <b v-if="profile.index === selected && profileDraftChanged" class="draft">Draft</b>
          </span>
        </button>
      </div>
    </div>

    <nav class="app-navigation" aria-label="Primary navigation">
      <button
        v-for="item in navigation"
        :key="item.id"
        type="button"
        :class="{ active: currentPage === item.id }"
        :aria-current="currentPage === item.id ? 'page' : undefined"
        :aria-label="item.label"
        :title="item.label"
        :disabled="iapActive && item.id !== 'firmware'"
        @click="navigate(item.id)"
      >
        <component :is="item.icon" class="app-navigation-icon" />
        <span class="app-navigation-full">{{ item.label }}</span>
        <span class="app-navigation-short">{{ item.shortLabel }}</span>
      </button>
    </nav>

    <div class="app-header-actions">
      <label class="language-switcher">
        <span class="visually-hidden">Language</span>
        <select :value="currentLocale" aria-label="Language" @change="setLocale($event.target.value)">
          <option v-for="item in locales" :key="item.code" :value="item.code">{{ item.nativeName }}</option>
        </select>
      </label>
      <button
        type="button"
        class="header-state-action"
        :class="`state-${state.mode}`"
        :disabled="state.disabled"
        :aria-label="state.label"
        :aria-busy="state.spinning"
        aria-live="polite"
        :title="state.label"
        @click="emitPrimaryAction"
      >
        <i class="header-state-dot"></i>
        <span>{{ state.label }}</span>
      </button>
      <button
        v-if="connected"
        type="button"
        class="header-disconnect-action"
        :disabled="busy || disconnecting"
        :aria-busy="disconnecting"
        :title="disconnecting ? 'Disconnecting…' : 'Disconnect WebHID'"
        :aria-label="disconnecting ? 'Disconnecting…' : 'Disconnect WebHID'"
        @click="emitDisconnect"
      >
        <LogOut class="header-disconnect-icon" />
        <span class="header-disconnect-label">{{ disconnecting ? "Disconnecting…" : "Disconnect" }}</span>
      </button>
      <div class="more-wrap">
        <button
          ref="moreTrigger"
          class="icon-button header-more-button"
          type="button"
          title="More actions"
          aria-label="More actions"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          @click="toggleMoreMenu"
        ><MoreHorizontal class="icon" /></button>
        <div v-if="moreOpen" class="more-menu header-more-menu" role="menu">
          <button type="button" role="menuitem" :disabled="!connected || busy || iapActive" @click="emitMore('refresh')">
            <RefreshCw class="menu-icon" />Refresh device
          </button>
          <button type="button" role="menuitem" @click="emitMore('import-profile')">Import Profile</button>
          <button type="button" role="menuitem" @click="emitMore('export-profile')">Export Profile</button>
          <button type="button" role="menuitem" :disabled="!connected" @click="emitMore('export-backup')">Export Full Backup</button>
          <button type="button" role="menuitem" @click="emitMore('device-info')">Device Information</button>
          <button type="button" role="menuitem" :disabled="iapActive" @click="emitMore('factory-reset')">Factory Reset</button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  Activity,
  ChevronDown,
  Gauge,
  Home,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  SlidersHorizontal,
  UploadCloud,
} from "@lucide/vue";
import { availableLocales, currentLocale, setLocale } from "../i18n.js";

const props = defineProps({
  profiles: { type: Array, required: true },
  active: { type: Number, default: 0 },
  boot: { type: Number, default: 0 },
  selected: { type: Number, default: 0 },
  profileDraftChanged: { type: Boolean, default: false },
  connected: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  profileSwitchBlocked: { type: Boolean, default: false },
  disconnecting: { type: Boolean, default: false },
  currentPage: { type: String, default: "home" },
  state: { type: Object, required: true },
  iapActive: { type: Boolean, default: false },
});
const emit = defineEmits([
  "navigate",
  "profile-select",
  "primary-action",
  "disconnect",
  "refresh",
  "import-profile",
  "export-profile",
  "export-backup",
  "device-info",
  "factory-reset",
]);

const headerRoot = ref(null);
const profileTrigger = ref(null);
const moreTrigger = ref(null);
const profileOpen = ref(false);
const moreOpen = ref(false);
const locales = availableLocales();
const selectedColor = computed(() => (
  props.profiles.find((profile) => profile.index === props.selected)?.hex || "#3080ff"
));
const navigation = [
  { id: "home", label: "Home", shortLabel: "Home", icon: Home },
  { id: "configurator", label: "Configurator", shortLabel: "Config", icon: SlidersHorizontal },
  { id: "calibration", label: "Analog Calibration", shortLabel: "Calibrate", icon: Gauge },
  { id: "firmware", label: "Firmware Upgrade", shortLabel: "Upgrade", icon: UploadCloud },
  { id: "diagnostics", label: "Diagnostics", shortLabel: "Diagnostics", icon: Activity },
];

function toggleProfileMenu() {
  profileOpen.value = !profileOpen.value;
  moreOpen.value = false;
}

function toggleMoreMenu() {
  moreOpen.value = !moreOpen.value;
  profileOpen.value = false;
}

function selectProfile(index) {
  profileOpen.value = false;
  emit("profile-select", index);
}

function navigate(page) {
  profileOpen.value = false;
  moreOpen.value = false;
  emit("navigate", page);
}

function emitPrimaryAction() {
  profileOpen.value = false;
  moreOpen.value = false;
  emit("primary-action", props.state.action);
}

function emitDisconnect() {
  profileOpen.value = false;
  moreOpen.value = false;
  emit("disconnect");
}

function emitMore(name) {
  moreOpen.value = false;
  emit(name);
}

function closeMenus(event) {
  if (event.type === "keydown" && event.key !== "Escape") {
    return;
  }
  if (event.type === "pointerdown" && headerRoot.value?.contains(event.target)) {
    return;
  }
  const returnTarget = profileOpen.value
    ? profileTrigger.value
    : moreOpen.value ? moreTrigger.value : null;
  profileOpen.value = false;
  moreOpen.value = false;
  if (event.type === "keydown") {
    returnTarget?.focus();
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", closeMenus);
  window.addEventListener("keydown", closeMenus);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeMenus);
  window.removeEventListener("keydown", closeMenus);
});
</script>
