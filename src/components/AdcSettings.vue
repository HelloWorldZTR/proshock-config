<template>
  <section class="system-group adc-settings">
    <h2>ADC sampling</h2>
    <div class="system-pollrate">
      <span>ADC source</span>
      <div>
        <div class="adc-source-switch" role="group" aria-label="ADC source">
          <button type="button" class="active" aria-pressed="true" disabled>Internal ADC</button>
          <button type="button" aria-pressed="false" disabled>External ADC</button>
        </div>
        <p class="adc-note">External ADC · 14 / 16 / 18 bit · available in a future firmware update.</p>
      </div>
    </div>
    <div class="system-pollrate">
      <span id="adc-depth-label">Sampling depth</span>
      <div>
        <div class="adc-depth-control" :class="{ locked: disabled || !supported }">
          <div class="adc-depth-slider">
            <div class="adc-depth-rail">
              <div class="adc-depth-fill" :style="{ width: `calc(${index / 5 * 100}% + ${10 - index / 5 * 20}px)` }"></div>
              <div class="adc-depth-dots" aria-hidden="true">
                <i v-for="(depth, tick) in ADC_DEPTH_OPTIONS" :key="depth" :style="{ left: `${tick / 5 * 100}%` }" :class="{ future: !ADC_DEPTH_CODES.includes(depth), passed: tick <= index }"></i>
              </div>
              <input type="range" min="0" max="3" step="1" :value="index" aria-labelledby="adc-depth-label" :aria-valuetext="bits === 14 ? '14 bit (4 samples)' : `${bits} bit`" :disabled="disabled || !supported" @input="selectDepth(Number($event.target.value))">
            </div>
            <div class="adc-depth-ticks">
              <button v-for="(depth, tick) in ADC_DEPTH_OPTIONS" :key="depth" type="button" :class="{ selected: depth === bits }" :aria-label="`${depth} bit`" :aria-pressed="depth === bits" :disabled="disabled || !supported || !ADC_DEPTH_CODES.includes(depth)" @click="selectDepth(tick)">{{ depth }}</button>
            </div>
          </div>
          <div class="adc-depth-summary" aria-live="polite">
            <strong>{{ bits === 14 ? 'Higher precision' : 'Lower latency' }}</strong>
            <span>{{ bits === 14 ? '14 bit (4 samples)' : `${bits} bit` }}</span>
          </div>
          <button type="button" class="adc-depth-reset" aria-label="Restore 12-bit sampling" :disabled="disabled || !supported || bits === 12" @click="selectDepth(2)">Restore default</button>
        </div>
        <p v-if="!supported" class="adc-note">Update firmware to support sampling depth.</p>
        <p v-else-if="bits === 14" class="adc-note">Four readings are combined for each update. Input updates remain at 8 kHz.</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ADC_DEPTH_CODES, ADC_DEPTH_OPTIONS } from '../protocol.js';
import { computed } from 'vue';
const props = defineProps({ bits: {type:Number, default:12}, supported:Boolean, disabled:Boolean });
const emit = defineEmits(['update']);
const index = computed(() => Math.max(0, ADC_DEPTH_OPTIONS.indexOf(props.bits)));
/** @brief Select only supported internal depths from pointer, keyboard or reset input. */
function selectDepth(tick) {
  if (props.disabled || !props.supported || !Number.isInteger(tick)) return;
  const bits = ADC_DEPTH_OPTIONS[tick];
  if (ADC_DEPTH_CODES.includes(bits)) emit('update', bits);
}
</script>

<style scoped>
.adc-source-switch { display: inline-flex; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; }
.adc-source-switch button { border: 0; border-radius: 0; padding: 9px 16px; font-size: 12px; }
.adc-source-switch button.active { color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); opacity: 1; }
.adc-source-switch button + button { border-left: 1px solid var(--border); }
.adc-note { margin: 8px 0 0; font-size: 11px; line-height: 1.5; color: var(--muted); }
.adc-depth-control { display: grid; grid-template-columns: minmax(0, 1fr) max-content max-content; align-items: center; gap: 16px; width: min(100%, 640px); }
.adc-depth-slider { min-width: 0; padding-top: 3px; }
.adc-depth-summary { display: grid; gap: 3px; min-width: 96px; }
.adc-depth-summary strong { color: var(--accent); font-size: 12px; font-weight: 600; line-height: 1.5; }
.adc-depth-summary span { color: var(--secondary); font-size: 11px; line-height: 1.5; white-space: nowrap; }
.adc-depth-reset { min-height: 32px; padding: 0 10px; font-size: 11px; }
.adc-depth-rail { position: relative; height: 24px; border-radius: 12px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--border-strong); }
.adc-depth-fill { position: absolute; inset: 0 auto 0 0; background: color-mix(in srgb, var(--accent) 75%, var(--surface-2)); border-radius: 12px 0 0 12px; }
.adc-depth-dots { position: absolute; inset: 0 10px; pointer-events: none; }
.adc-depth-dots i { position: absolute; top: 50%; width: 4px; height: 4px; border-radius: 50%; background: var(--muted); transform: translate(-50%, -50%); }
.adc-depth-dots i.passed { background: var(--surface-1); opacity: .5; }
.adc-depth-dots i.future { opacity: .3; }
.adc-depth-rail input { position: absolute; top: -4px; left: 0; width: calc(60% + 8px); height: 32px; min-height: 0; margin: 0; padding: 0; border: 0; border-radius: 12px; appearance: none; -webkit-appearance: none; background: transparent; cursor: pointer; }
.adc-depth-rail input::-webkit-slider-runnable-track { height: 24px; background: transparent; }
.adc-depth-rail input::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; margin-top: 2px; border: 0; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--surface-1); }
.adc-depth-rail input::-moz-range-track { height: 24px; background: transparent; }
.adc-depth-rail input::-moz-range-thumb { width: 20px; height: 20px; border: 0; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--surface-1); }
.adc-depth-rail input:disabled { opacity: 1; }
.adc-depth-rail input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.adc-depth-ticks { display: flex; justify-content: space-between; padding-top: 3px; }
.adc-depth-ticks button { width: 20px; padding: 0; min-height: 22px; border: 0; background: transparent; font: 10px var(--font-mono); color: var(--secondary); }
.adc-depth-ticks button.selected { color: var(--accent); }
.adc-depth-ticks button:disabled { opacity: .3; }
.adc-depth-control.locked { opacity: .55; }
.adc-depth-control.locked input { cursor: default; }
@media (max-width: 680px) { .adc-depth-control { grid-template-columns: minmax(0, 1fr) max-content; gap: 8px 12px; } .adc-depth-reset { grid-column: 2; justify-self: start; } }
</style>
