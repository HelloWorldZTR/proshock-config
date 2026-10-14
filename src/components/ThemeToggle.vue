<template>
  <button type="button" class="icon-button theme-toggle" :title="label" :aria-label="label" @click="setTheme(currentTheme === 'dark' ? 'light' : 'dark')">
    <Sun v-if="currentTheme === 'dark'" class="icon" aria-hidden="true" />
    <Moon v-else class="icon" aria-hidden="true" />
  </button>
</template>
<script setup>
import { computed } from "vue";
import { Sun, Moon } from "@lucide/vue";
import { currentTheme, setTheme } from "../theme.js";
const label = computed(() => currentTheme.value === "dark" ? "Switch to light mode" : "Switch to dark mode");
</script>
