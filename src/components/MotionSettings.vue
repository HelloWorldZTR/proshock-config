<template>
  <section class="motion-settings">
    <p v-if="!supported" class="accessory-note">MPU-6050 requires firmware 0.5.3, build 2026100301 or newer.</p>
    <template v-else-if="modelValue">
      <p>Fixed bottom mount · VCC toward the right grip. Motion sampling is independent of USB polling.</p>
      <div class="motion-calibration" :aria-busy="calibrating">
        <strong>Gyro calibration</strong>
        <p>Keep the controller still to correct movement when you are not turning it.</p>
        <button v-if="!calibrating" type="button" class="calibrate-button" :disabled="disabled" @click="$emit('calibrate')">Calibrate gyroscope</button>
        <div v-else>
          <p class="stillness-instruction">Place the controller on a stable surface. Release it and keep it still until calibration finishes.</p>
          <p role="status" aria-live="polite">{{ progressLabel }}</p>
          <progress v-if="calibration.phase === 'sampling'" max="100" :value="calibration.progress" :aria-label="translate('Gyro calibration progress')" />
          <button type="button" @click="$emit('cancel')">Cancel calibration</button>
        </div>
        <p v-if="calibration?.message" :role="calibration.phase === 'error' ? 'alert' : 'status'">{{ translate(calibration.message) }}</p>
      </div>
      <fieldset :disabled="disabled">
        <details class="motion-advanced"><summary>Filter settings</summary>
        <label><span>Hardware low-pass · accel / gyro</span><select :value="modelValue.dlpf" @change="update('dlpf', Number($event.target.value))"><option v-for="option in MOTION_DLPF" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
        <label><span>Gyro smoothing cutoff (Hz)</span><input type="number" min="0" max="250" step="1" :value="modelValue.gyro_cutoff_hz" @input="updateNumber('gyro_cutoff_hz', $event)"></label>
        <label><span>Accel smoothing cutoff (Hz)</span><input type="number" min="0" max="250" step="1" :value="modelValue.accel_cutoff_hz" @input="updateNumber('accel_cutoff_hz', $event)"></label>
        <p>Lower cutoffs reduce noise and add delay. Set software cutoff to 0 to bypass it.</p>
        </details>
        <details class="motion-advanced"><summary>Manual gyro offsets</summary>
          <p>Native sensor X/Y/Z offsets in raw counts. 16.4 counts = 1 degree/second.</p>
          <label v-for="(axis, index) in ['X', 'Y', 'Z']" :key="axis"><span>{{ axis }}</span><input type="number" min="-32768" max="32767" step="1" :aria-label="`Gyro ${axis} zero offset`" :value="modelValue.gyro_bias[index]" @input="updateBias(index, $event)"></label>
        </details>
      </fieldset>
      <p v-if="!validMotion(modelValue)" role="alert">Invalid motion settings.</p>
      <details class="motion-advanced"><summary>Sensor diagnostics</summary>
      <p v-if="telemetry" class="motion-status">{{ statusLabel }}<br><span>Samples</span>: {{ telemetry.samples }} · <span>Errors</span>: {{ telemetry.errors }}<br><span>Longest sensor service (µs)</span>: {{ telemetry.max_service_us }}</p>
      <button type="button" :disabled="disabled" @click="$emit('refresh')">Refresh sensor status</button>
      </details>
    </template>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount } from "vue";
import { translate } from "../i18n.js";
import { MOTION_DLPF, validMotion } from "../motion.js";
const props = defineProps({ modelValue: Object, supported: Boolean, disabled: Boolean, telemetry: Object, calibration: Object });
const emit = defineEmits(["update:modelValue", "refresh", "calibrate", "cancel"]);
const calibrating = computed(() => ['settling', 'sampling'].includes(props.calibration?.phase));
const progressLabel = computed(() => props.calibration?.phase === 'settling'
  ? translate(`Sampling starts in ${props.calibration.remaining} seconds.`)
  : translate(`Keep still. Calibration ${props.calibration?.progress || 0}% complete.`));
onBeforeUnmount(() => { if (calibrating.value) emit('cancel'); });
const statusLabel = computed(() => translate(['Disabled', 'Sensor starting', 'Sensor streaming', 'Sensor unavailable'][props.telemetry?.status] || 'Sensor unavailable'));
/** @brief Edit only the selected draft field; Apply and Save remain explicit. */
function update(field, value) { emit('update:modelValue', { ...props.modelValue, [field]: value }); }
/** @brief Keep empty/invalid numeric drafts invalid instead of silently writing zero. */
function updateNumber(field, event) { update(field, event.target.value === '' ? NaN : Number(event.target.value)); }
/** @brief Preserve the other native-axis offsets during an individual edit. */
function updateBias(index, event) {
  const values = [...props.modelValue.gyro_bias];
  values[index] = event.target.value === '' ? NaN : Number(event.target.value);
  update('gyro_bias', values);
}
</script>
<style scoped>
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
label { display: grid; gap: 6px; margin: 12px 0; font-size: 11px; }
select, input[type=number] { width: 100%; }
p { font-size: 11px; color: var(--secondary); line-height: 1.6; }
summary { font-size: 12px; cursor: pointer; }
.motion-calibration { margin: 16px 0; padding: 14px; border: 1px solid var(--border); border-radius: 8px; }
.motion-calibration strong { font-size: 13px; }
.motion-calibration button, progress { width: 100%; }
.calibrate-button { color: var(--accent); border-color: var(--accent); }
.stillness-instruction { color: var(--text); }
.motion-advanced { padding: 12px 0; border-top: 1px solid var(--border); }
progress { height: 6px; margin-bottom: 12px; accent-color: var(--accent); }
.motion-status { font-family: var(--font-mono); }
</style>
