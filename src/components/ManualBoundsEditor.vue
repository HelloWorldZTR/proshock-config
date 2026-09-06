<template>
  <section class="manual-bounds-editor">
    <header class="page-heading">
      <h1>Manual settings</h1>
      <p>Device-level · Affects all Profiles.</p>
      <p>Stick bounds must stay at least 128 ADC counts from center. The released trigger endpoint must be below the pressed endpoint.</p>
    </header>
    <section v-for="group in groups" :key="group.label" class="bounds-group">
      <h2>{{ group.label }}</h2>
      <div class="bounds-table" role="table" :aria-label="group.label">
        <div class="bounds-row bounds-labels" role="row"><span role="columnheader">Input</span><span role="columnheader">{{ group.kind === 'axis' ? 'Lower bound' : 'Released endpoint' }}</span><span role="columnheader">{{ group.kind === 'axis' ? 'Center' : '—' }}</span><span role="columnheader">{{ group.kind === 'axis' ? 'Upper bound' : 'Pressed endpoint' }}</span></div>
        <div v-for="index in group.indices" :key="index" class="bounds-row" role="row">
          <strong role="rowheader">{{ calibration[group.kind][index].name }}</strong>
          <label role="cell"><span class="visually-hidden">{{ calibration[group.kind][index].name }} {{ group.kind === 'axis' ? 'Lower bound' : 'Released endpoint' }}</span><input :aria-label="`${calibration[group.kind][index].name} Lower bound`" type="number" min="0" max="4095" step="1" :value="calibration[group.kind][index][group.kind === 'axis' ? 'raw_min' : 'raw_released']" @input="update($event, group.kind, index, group.kind === 'axis' ? 'raw_min' : 'raw_released')"></label>
          <label v-if="group.kind === 'axis'" role="cell">
            <span class="visually-hidden">{{ calibration.axis[index].name }} Center</span>
            <input :aria-label="`${calibration.axis[index].name} Center`" type="number" min="0" max="4095" step="1" :value="calibration.axis[index].raw_center" @input="update($event, 'axis', index, 'raw_center')">
          </label>
          <span v-else role="cell" class="bounds-center">—</span>
          <label role="cell"><span class="visually-hidden">{{ calibration[group.kind][index].name }} {{ group.kind === 'axis' ? 'Upper bound' : 'Pressed endpoint' }}</span><input :aria-label="`${calibration[group.kind][index].name} Upper bound`" type="number" min="0" max="4095" step="1" :value="calibration[group.kind][index][group.kind === 'axis' ? 'raw_max' : 'raw_pressed']" @input="update($event, group.kind, index, group.kind === 'axis' ? 'raw_max' : 'raw_pressed')"></label>
        </div>
      </div>
    </section>
    <div v-if="errors.length" class="field-error" role="alert"><p v-for="error in errors" :key="error">{{ error }}</p></div>
    <SettingsApplyFooter :state="applyState" :state-label="stateLabel" @apply="$emit('apply')" />
  </section>
</template>
<script setup>
import SettingsApplyFooter from "./SettingsApplyFooter.vue";
defineProps({ calibration: Object, errors: { type: Array, default: () => [] }, applyState: Object, stateLabel: String });
const emit = defineEmits(["update", "apply"]);
const groups = [{ label: "Left stick", kind: "axis", indices: [0, 1] }, { label: "Right stick", kind: "axis", indices: [2, 3] }, { label: "Triggers", kind: "trigger", indices: [0, 1] }];
/** Preserve invalid input as NaN so shared calibration validation blocks Apply. */
function update(event, kind, index, field) { emit("update", { kind, index, field, value: event.target.valueAsNumber }); }
</script>
