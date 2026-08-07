<template>
  <div class="mapping-artwork">
    <div class="mapping-artwork-svg" v-html="controllerSvg"></div>
  </div>
</template>

<script setup>
import controllerSvgSource from "../assets/dualshock-4-layout.svg?raw";

const controllerSvg = controllerSvgSource.replace(
  "<svg",
  '<svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet"',
);
</script>
