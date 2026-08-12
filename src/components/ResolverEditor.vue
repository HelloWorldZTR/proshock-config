<template>
  <section class="resolver-editor">
    <div v-if="errors.length" class="resolver-errors" role="alert">
      <strong>Fix before Apply</strong><span>{{ errors[0] }}</span>
      <button type="button" class="text-button" @click="emit('update', createDefaultResolver())">Reset Resolver</button>
    </div>
    <div v-else-if="capacityWarnings.length" class="resolver-capacity-warning" role="status">
      <strong>Capacity</strong><span>{{ capacityWarnings.join(" · ") }}</span>
    </div>

    <div class="mapping-workspace">
      <div class="controller-stage">
        <header class="mapping-toolbar">
          <div class="mapping-source-tools">
            <button
              type="button"
              class="input-drawer-button"
              :class="{ active: inputDrawerOpen }"
              @click="toggleInputDrawer"
            >
              <span>All inputs</span><small>26</small>
            </button>
            <button
              type="button"
              class="input-drawer-button"
              :class="{ active: comboDrawerOpen }"
              @click="toggleComboDrawer"
            >
              <span>Combos</span><small>{{ resolver.combos.length }}/4</small>
            </button>
            <!-- Temporary SVG hotspot debug entry. Uncomment when re-measuring. -->
            <!--
            <button
              type="button"
              class="input-drawer-button hotspot-debug-toggle"
              :class="{ active: hotspotDebugEnabled }"
              @click="toggleHotspotDebug"
            >
              <span>Debug points</span><small>SVG</small>
            </button>
            -->
          </div>
          <div class="mapping-toolbar-modes">
            <div class="layer-switcher" aria-label="Mapping layer">
              <button v-for="item in layerChoices" :key="item.id" type="button" :class="{ active: editingLayer === item.id }" @click="editingLayer = item.id">{{ item.label }}</button>
            </div>
            <div class="view-switcher" aria-label="Controller view">
              <button type="button" :class="{ active: view === 'front' }" @click="setView('front')">Front</button>
              <button type="button" :class="{ active: view === 'back' }" @click="setView('back')">K1–K8</button>
            </div>
          </div>
        </header>
        <div
          class="controller-map"
          :class="[`controller-map--${view}`, { 'hotspot-debug-active': hotspotDebugEnabled }]"
          @click="captureHotspotPoint"
        >
          <MappingControllerArtwork
            class="mapping-controller-art"
          />
          <button
            v-for="hotspot in visibleHotspots"
            :key="hotspot.source"
            type="button"
            class="controller-hotspot"
            :class="{
              active: selectedComboIndex === null && selectedSource === hotspot.source,
              pressed: pressedSources.has(hotspot.source),
              'debug-target': hotspotDebugEnabled && debugSource === hotspot.source,
              'debug-marked': hotspotDebugEnabled && debugMarkedSources.has(hotspot.source),
            }"
            :style="{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }"
            :aria-label="`Select ${SOURCE_NAMES[hotspot.source]}`"
            data-i18n-ignore
            @click="selectSource(hotspot.source)"
          >
            <span>{{ hotspot.short }}</span>
          </button>
        </div>
        <div class="selection-dock">
          <span>
            <small>Selected input</small>
            <strong data-i18n-ignore>{{ selectedTargetName }}</strong>
            <em>{{ selectedTargetMeta }}</em>
          </span>
          <i>→</i>
          <span>
            <small>{{ selectedComboIndex !== null ? "Combo result" : editingLayer ? "Layer assignment" : "Current assignment" }}</small>
            <strong class="accent" :data-i18n-ignore="isGamepadAction(selectedTargetAction) ? '' : null">{{ actionLabel(selectedTargetAction) }}</strong>
            <em v-if="selectedComboIndex !== null">Triggers after the full chord</em>
            <em v-else-if="editingLayer && !layerOverride(selectedSource)">Inherited from Base</em>
            <em v-else>{{ layerChoices.find((item) => item.id === editingLayer)?.label }}</em>
          </span>
        </div>

        <aside v-if="inputDrawerOpen" class="input-drawer">
          <header>
            <div><span>Physical controls</span><small>Select without using the device map</small></div>
            <button type="button" aria-label="Close input list" @click="inputDrawerOpen = false">×</button>
          </header>
          <label class="source-search"><span class="visually-hidden">Search physical inputs</span><input v-model="sourceQuery" placeholder="Search inputs or GPIO"></label>
          <div class="input-drawer-groups">
            <div v-for="group in filteredGroups" :key="group.id" class="source-group">
              <h3>{{ group.label }}</h3>
              <button
                v-for="sourceId in group.sources"
                :key="sourceId"
                type="button"
                :class="{ active: selectedSource === sourceId, pressed: pressedSources.has(sourceId), reserved: sourceId >= 26 }"
                :disabled="sourceId >= 26"
                @click="selectSource(sourceId)"
              >
                <span><strong data-i18n-ignore>{{ SOURCE_NAMES[sourceId] }}</strong><small>{{ sourceMeta(sourceId) }}</small></span>
                <b :data-i18n-ignore="isGamepadAction(effectiveAction(sourceId)) ? '' : null">{{ actionLabel(effectiveAction(sourceId)) }}</b>
              </button>
            </div>
          </div>
        </aside>

        <aside v-if="comboDrawerOpen" class="input-drawer combo-mapping-drawer">
          <header>
            <div><span>Combo inputs</span><small>Select a chord, then assign its result on the right</small></div>
            <button type="button" aria-label="Close combo list" @click="comboDrawerOpen = false">×</button>
          </header>
          <section class="system-combo-shortcuts" aria-label="Built-in system shortcuts">
            <header><span>System shortcuts</span><small>Built into firmware · PS is always the Leader · 100 ms window</small></header>
            <div v-for="shortcut in systemCombos" :key="shortcut.direction">
              <span><b>PS</b><i>Leader</i><strong>+</strong><b>{{ shortcut.direction }}</b></span>
              <em>Profile {{ shortcut.profile }}</em>
            </div>
          </section>
          <div class="combo-slot-list">
            <button
              v-for="index in 4"
              :key="index"
              type="button"
              :class="{ active: selectedComboIndex === index - 1, locked: index - 1 > resolver.combos.length }"
              :disabled="index - 1 > resolver.combos.length"
              @click="selectCombo(index - 1)"
            >
              <span>
                <strong>Combo {{ index }}</strong>
                <small v-if="resolver.combos[index - 1]"><span data-i18n-ignore>{{ comboMemberLabel(resolver.combos[index - 1]) }}</span> · Leader: <span data-i18n-ignore>{{ SOURCE_NAMES[resolver.combos[index - 1].leader_source_id] }}</span></small>
                <small v-else>{{ index - 1 === resolver.combos.length ? "Create chord" : "Create the previous combo first" }}</small>
              </span>
              <b>{{ resolver.combos[index - 1] ? actionLabel(resolver.combos[index - 1].action_id) : "+" }}</b>
            </button>
          </div>
        </aside>

        <aside v-if="comboDrawerOpen && selectedCombo" class="input-drawer combo-editor-drawer">
          <header>
            <button type="button" class="combo-editor-back" aria-label="Back to Combo list" @click="closeComboEditor">←</button>
            <div>
              <span>Combo {{ selectedComboIndex + 1 }}</span>
              <small><span data-i18n-ignore>{{ comboMemberLabel(selectedCombo) }}</span> · Leader: <span data-i18n-ignore>{{ SOURCE_NAMES[selectedCombo.leader_source_id] }}</span></small>
            </div>
            <button type="button" aria-label="Close Combo drawers" @click="comboDrawerOpen = false">×</button>
          </header>
          <div class="combo-editor-actions">
            <button type="button" class="primary" :disabled="!connected || comboCaptureActive" @click="startComboCapture">Record on controller</button>
            <button type="button" class="text-button danger-text" @click="removeSelectedCombo">Remove Combo</button>
          </div>
          <div class="combo-editor-scroll">
            <div v-if="comboCaptureState !== 'idle'" class="combo-capture-status" :class="comboCaptureState">
              <span><i></i><strong>{{ comboCaptureLabel }}</strong></span>
              <small>{{ comboCaptureDetail }}</small>
              <button v-if="comboCaptureActive" type="button" class="text-button" @click="stopComboCapture">Cancel</button>
              <button v-else type="button" class="text-button" @click="resetComboCapture">Dismiss</button>
            </div>
            <div class="combo-member-grid">
              <button
                v-for="sourceId in 26"
                :key="sourceId"
                type="button"
                data-i18n-ignore
                :class="{ active: hasComboSource(selectedCombo, sourceId - 1), leader: selectedCombo.leader_source_id === sourceId - 1 }"
                @click="toggleComboSource(selectedComboIndex, sourceId - 1)"
              >{{ SOURCE_NAMES[sourceId - 1] }}</button>
            </div>
            <div class="combo-inline-options">
              <label>Leader<select :value="selectedCombo.leader_source_id" data-i18n-ignore @change="updateCombo(selectedComboIndex, 'leader_source_id', Number($event.target.value))"><option v-for="sourceId in comboSources(selectedCombo)" :key="sourceId" :value="sourceId">{{ SOURCE_NAMES[sourceId] }}</option></select></label>
              <p class="combo-leader-warning"><strong>Leader adds latency.</strong> Its normal Mapping can be delayed by up to 100 ms while firmware waits for the chord. Other members may be held before pressing the Leader, which acts as the Combo activation key.</p>
              <label class="check-field"><input type="checkbox" :checked="selectedCombo.consume" @change="updateCombo(selectedComboIndex, 'consume', $event.target.checked)"> Consume members</label>
              <label class="check-field"><input type="checkbox" :checked="selectedCombo.exact" @change="updateCombo(selectedComboIndex, 'exact', $event.target.checked)"> Exact chord only</label>
            </div>
          </div>
        </aside>
      </div>

      <aside v-if="hotspotDebugEnabled" class="assignment-panel hotspot-debug-panel">
        <header>
          <span>SVG hotspot debug</span>
          <small>VIEWBOX 600 × 400</small>
        </header>
        <div class="hotspot-debug-body">
          <p>选择按钮后点击手柄图。坐标由 SVG 的 <code>getScreenCTM()</code> 反算，百分比始终相对于 SVG viewBox。</p>
          <label class="hotspot-debug-auto">
            <input v-model="debugAutoAdvance" type="checkbox">
            <span>打点后自动选择下一个按钮</span>
          </label>
          <div class="hotspot-debug-list">
            <button
              v-for="hotspot in frontHotspotDraft"
              :key="hotspot.source"
              type="button"
              :class="{ active: debugSource === hotspot.source, marked: debugMarkedSources.has(hotspot.source) }"
              @click="selectDebugSource(hotspot.source)"
            >
              <span data-i18n-ignore><b>{{ hotspot.short }}</b>{{ SOURCE_NAMES[hotspot.source] }}</span>
              <code>{{ formatHotspotCoordinate(hotspot) }}</code>
            </button>
          </div>
          <div v-if="lastDebugPoint" class="hotspot-debug-readout">
            <strong data-i18n-ignore>{{ SOURCE_NAMES[lastDebugPoint.source] }}</strong>
            <span>SVG: {{ lastDebugPoint.svgX }}, {{ lastDebugPoint.svgY }}</span>
            <span>Percent: {{ lastDebugPoint.x }}%, {{ lastDebugPoint.y }}%</span>
          </div>
          <textarea
            class="hotspot-debug-output"
            :value="debugHotspotCode"
            aria-label="Generated front hotspot coordinates"
            readonly
          ></textarea>
        </div>
        <footer class="hotspot-debug-footer">
          <span>{{ debugMarkedSources.size }}/18 marked</span>
          <button type="button" class="text-button" @click="resetDebugHotspots">Reset</button>
          <button type="button" class="primary" @click="copyDebugHotspots">{{ debugCopyStatus }}</button>
        </footer>
      </aside>

      <aside v-else class="assignment-panel">
        <header>
          <span>Assign</span>
          <small><span data-i18n-ignore>{{ selectedTargetName }}</span> · <span :data-i18n-ignore="isGamepadAction(selectedTargetAction) ? '' : null">{{ actionLabel(selectedTargetAction) }}</span></small>
        </header>
        <div class="assignment-menu">
          <nav class="assignment-families" aria-label="Action categories">
            <button
              v-for="family in actionFamilies"
              :key="family.id"
              type="button"
              :class="{ active: activeActionFamily === family.id }"
              :disabled="!family.count && family.id !== 'Macro'"
              @click="activeActionFamily = family.id"
            >
              <span>{{ family.icon }}</span>
              <b>{{ family.label }}</b>
              <small>{{ family.count }}</small>
            </button>
          </nav>
          <div class="action-menu-column">
            <div class="action-menu-heading">
              <span>{{ activeFamilyMeta.label }}</span>
              <small>{{ familyActions.length }} available</small>
            </div>
            <div v-if="activeActionFamily === 'Macro' && !familyActions.length" class="empty-action-family">
              <span>No macros recorded</span>
              <button type="button" class="primary" @click="openManagerDrawer('macros')">Record macro</button>
            </div>
            <div v-else class="action-list">
              <button
                v-for="action in familyActions"
                :key="action.id"
                type="button"
                :class="{ active: selectedTargetAction === action.id }"
                @click="assignAction(action.id)"
              >
                <MacroOutputIcons
                  v-if="action.family === 'Gamepad'"
                  class="action-gamepad-icon"
                  :mask="1 << (action.id - ACTION.GAMEPAD_FIRST)"
                  compact
                />
                <span v-else class="action-family-glyph">{{ actionGlyph(action) }}</span>
                <span class="action-list-copy">
                  <strong :data-i18n-ignore="action.family === 'Gamepad' ? '' : null">{{ action.label }}</strong>
                  <small>{{ actionDescriptor(action) }}</small>
                </span>
                <b v-if="selectedTargetAction === action.id">Assigned</b>
              </button>
            </div>
          </div>
        </div>
        <footer>
          <nav class="resolver-manager-links" aria-label="Resolver management tools">
            <button type="button" @click="openManagerDrawer('macros')"><span>Macros</span><small>{{ stepCount }}/10</small></button>
            <button type="button" @click="openManagerDrawer('layers')"><span>Layers</span><small>{{ overrideCount }}/8</small></button>
          </nav>
          <div class="assignment-utilities">
            <button v-if="selectedComboIndex === null && editingLayer" type="button" class="inherit-button" @click="removeOverride(selectedSource)">Inherit from Base</button>
            <button type="button" class="text-button" @click="resetSelected">Reset selected</button>
          </div>
        </footer>
      </aside>

      <div v-if="openManager" class="resolver-manager-scrim" @click.self="openManager = null">
        <aside class="resolver-manager-drawer" :aria-label="`Manage ${managerTitle}`">
          <header class="manager-drawer-header">
            <div><span>Manage</span><strong>{{ managerTitle }}</strong></div>
            <button type="button" aria-label="Close manager" @click="openManager = null">×</button>
          </header>
          <div class="manager-drawer-body">
    <div v-if="openManager === 'macros'" class="resolver-tool-page">
      <header class="tool-page-heading">
        <div><h2>Macros</h2><p>Choose a slot to record controller input. Existing slots can be recorded again.</p></div>
        <span class="capacity-chip">{{ stepCount }} / 10 steps</span>
      </header>
      <div class="macro-slot-grid">
        <button
          v-for="index in 4"
          :key="index"
          type="button"
          class="macro-slot-card"
          :class="{ filled: resolver.macros[index - 1], locked: index - 1 > resolver.macros.length || (!resolver.macros[index - 1] && stepCount >= 10) }"
          :disabled="index - 1 > resolver.macros.length || (!resolver.macros[index - 1] && stepCount >= 10)"
          @click="openMacroRecorder(index - 1)"
        >
          <span class="macro-slot-heading">
            <b>Macro {{ index }}</b>
            <small v-if="resolver.macros[index - 1]">Record again</small>
            <small v-else-if="index - 1 === resolver.macros.length">Record</small>
            <small v-else>Locked</small>
          </span>
          <span v-if="resolver.macros[index - 1]" class="macro-slot-preview">
            <span v-for="(step, stepIndex) in resolver.macros[index - 1].steps" :key="stepIndex">
              <MacroOutputIcons :mask="step.output_mask" compact />
              <small>{{ step.duration_4ms * 4 }} ms</small>
            </span>
          </span>
          <span v-else class="macro-slot-empty">{{ index - 1 === resolver.macros.length ? "+" : "Create the previous slot first" }}</span>
        </button>
      </div>
      <p class="macro-slot-note">Slots are stored in order. Clearing one slot also shifts the following slots forward.</p>
    </div>

    <div v-else class="resolver-tool-page">
      <header class="tool-page-heading">
        <div><h2>Sparse layer overrides</h2><p>Layer 2 wins over Layer 1. Inputs without an override inherit their Base assignment.</p></div>
        <span class="capacity-chip">{{ overrideCount }} / 8 shared overrides</span>
      </header>
      <div class="layer-cards">
        <article v-for="(layer, layerIndex) in resolver.layers" :key="layerIndex">
          <header><div><span>LAYER {{ layerIndex + 1 }}</span><strong>{{ layer.overrides.length }} override{{ layer.overrides.length === 1 ? "" : "s" }}</strong></div><button type="button" @click="editingLayer = layerIndex + 1; openManager = null">Open visual editor</button></header>
          <div v-if="!layer.overrides.length" class="layer-empty">No differences from Base.</div>
          <div v-for="entry in layer.overrides" :key="entry.source_id" class="layer-diff">
            <span><strong data-i18n-ignore>{{ SOURCE_NAMES[entry.source_id] }}</strong><small>Base · <span :data-i18n-ignore="isGamepadAction(resolver.base_mapping[entry.source_id]) ? '' : null">{{ actionLabel(resolver.base_mapping[entry.source_id]) }}</span></small></span>
            <b :data-i18n-ignore="isGamepadAction(entry.action_id) ? '' : null">{{ actionLabel(entry.action_id) }}</b>
            <button type="button" class="text-button" @click="removeLayerEntry(layerIndex, entry.source_id)">Remove</button>
          </div>
        </article>
      </div>
      <div class="layer-guidance"><strong>Activation lives in Mapping</strong><span>Assign any physical input to “Layer 1/2 · Momentary” or “Toggle”. Momentary release tracks the physical owner even when the layer changes its assignment.</span></div>
    </div>
          </div>
        </aside>
      </div>

      <div v-if="macroRecorderSlot !== null" class="macro-recorder-scrim">
        <section class="macro-recorder-modal" role="dialog" aria-modal="true" :aria-label="`Record Macro ${macroRecorderSlot + 1}`">
          <header>
            <div><span>{{ recorderExisting ? "Record again" : "New recording" }}</span><strong>Macro {{ macroRecorderSlot + 1 }}</strong></div>
            <button type="button" aria-label="Close macro recorder" @click="closeMacroRecorder">×</button>
          </header>
          <div class="macro-recorder-body">
            <div class="macro-recorder-status" :class="{ recording: isRecording, waiting: recordingWaitingForInput }">
              <i></i>
              <span>{{ recorderStatusLabel }}</span>
              <b>{{ formatDuration(recordingElapsedMs) }}</b>
            </div>

            <div class="macro-live-input">
              <span>Current input</span>
              <MacroOutputIcons :mask="liveOutputMask" />
              <small>{{ liveOutputLabel }}</small>
            </div>

            <div class="macro-recorded-preview">
              <header><span>Captured sequence</span><small>{{ recordedSteps.length }} / {{ recorderStepLimit }} steps</small></header>
              <div v-if="!recordedSteps.length" class="macro-recording-empty">Press Record, then use the controller buttons you want to capture.</div>
              <div v-else class="macro-recording-steps">
                <div
                  v-for="(step, stepIndex) in recordedSteps"
                  :key="stepIndex"
                  class="macro-recording-step"
                  :class="{ editing: editingStepIndex === stepIndex }"
                >
                  <b>{{ stepIndex + 1 }}</b>
                  <MacroOutputIcons :mask="step.output_mask" compact />
                  <label>
                    <input
                      type="number"
                      min="4"
                      max="1020"
                      step="4"
                      :value="step.duration_4ms * 4"
                      :disabled="isRecording"
                      aria-label="Step duration in milliseconds"
                      @change="updateRecordedStepDuration(stepIndex, $event)"
                    >
                    <span>ms</span>
                  </label>
                  <button
                    type="button"
                    class="macro-step-edit"
                    :class="{ active: editingStepIndex === stepIndex }"
                    :disabled="isRecording"
                    @click="toggleRecordedStepEditor(stepIndex)"
                  >{{ editingStepIndex === stepIndex ? "Done" : "Edit" }}</button>
                  <button
                    type="button"
                    class="macro-step-remove"
                    :disabled="isRecording"
                    aria-label="Remove captured step"
                    @click="removeRecordedStep(stepIndex)"
                  >×</button>
                  <div v-if="editingStepIndex === stepIndex" class="macro-step-editor">
                    <header>
                      <span>Step output</span>
                      <button type="button" :class="{ active: step.output_mask === 0 }" @click="setRecordedStepPause(stepIndex)">Pause</button>
                    </header>
                    <div class="macro-step-output-picker">
                      <button
                        v-for="outputId in 18"
                        :key="outputId"
                        type="button"
                        :class="{ active: step.output_mask & (1 << (outputId - 1)) }"
                        :aria-label="`Toggle ${SOURCE_NAMES[outputId - 1]}`"
                        :title="SOURCE_NAMES[outputId - 1]"
                        data-i18n-ignore
                        @click="toggleRecordedStepOutput(stepIndex, outputId - 1)"
                      >
                        <MacroOutputIcons :mask="1 << (outputId - 1)" compact />
                        <span>{{ SOURCE_NAMES[outputId - 1] }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="macro-option-mode">
              <span>Capture starts</span>
              <div>
                <button type="button" :class="{ active: recorderStartMode === 'record' }" :disabled="isRecording" @click="recorderStartMode = 'record'">On Record</button>
                <button type="button" :class="{ active: recorderStartMode === 'first-input' }" :disabled="isRecording" @click="recorderStartMode = 'first-input'">First input</button>
              </div>
            </div>

            <div class="macro-option-mode">
              <span>Playback</span>
              <div>
                <button v-for="mode in MACRO_MODES" :key="mode.id" type="button" :class="{ active: recorderMode === mode.id }" @click="setRecorderMode(mode.id)">{{ mode.label }}</button>
              </div>
            </div>
          </div>
          <footer>
            <button v-if="recorderExisting && !isRecording" type="button" class="text-button danger-text" @click="clearRecordedMacro">Clear slot</button>
            <button type="button" @click="closeMacroRecorder">Cancel</button>
            <button v-if="!isRecording" type="button" class="record-button" @click="startMacroRecording"><i></i>{{ recorderDirty ? "Record again" : "Record" }}</button>
            <button v-else type="button" class="stop-recording-button" @click="stopMacroRecording">Stop</button>
            <button type="button" class="primary" :disabled="isRecording || !recorderDirty || !recorderHasInput" @click="saveMacroRecording">Save recording</button>
          </footer>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import MacroOutputIcons from "./MacroOutputIcons.vue";
import MappingControllerArtwork from "./MappingControllerArtwork.vue";
import {
  COMBO_CAPTURE_POLL_MS,
  advanceComboCapture,
  createComboCaptureTracker,
  sourceIdsFromMask,
} from "../combo-capture.js";
import {
  ACTION,
  ACTION_OPTIONS,
  GPIO_NAMES,
  MACRO_MODES,
  SOURCE_GROUPS,
  SOURCE_NAMES,
  actionLabel,
  createDefaultResolver,
  validateResolver,
} from "../resolver-schema.js";

const props = defineProps({
  resolver: Object,
  raw: Object,
  connected: Boolean,
  readDigitalInput: Function,
});
const emit = defineEmits(["update"]);
const openManager = ref(null);
const selectedSource = ref(0);
const editingLayer = ref(0);
const view = ref("front");
const sourceQuery = ref("");
const inputDrawerOpen = ref(false);
const comboDrawerOpen = ref(false);
const selectedComboIndex = ref(null);
const comboCaptureState = ref("idle");
const comboCaptureMask = ref(0);
const comboCaptureLimited = ref(false);
const comboCaptureError = ref("");
const activeActionFamily = ref("Gamepad");
const hotspotDebugEnabled = ref(false);
const debugSource = ref(0);
const debugAutoAdvance = ref(true);
const debugMarkedSources = ref(new Set());
const lastDebugPoint = ref(null);
const debugCopyStatus = ref("Copy array");
const macroRecorderSlot = ref(null);
const isRecording = ref(false);
const recorderDirty = ref(false);
const recordedSteps = ref([]);
const recorderMode = ref(0);
const recorderStartMode = ref("record");
const recordingWaitingForInput = ref(false);
const editingStepIndex = ref(null);
const recordingElapsedMs = ref(0);
let recordingTimer = null;
let recordingStartedAt = 0;
let recordingSegmentStartedAt = 0;
let comboCaptureTimer = null;
let comboCaptureTracker = null;
const systemCombos = [
  { direction: "↑", profile: 1 },
  { direction: "→", profile: 2 },
  { direction: "↓", profile: 3 },
  { direction: "←", profile: 4 },
];
let recordingSegmentMask = 0;
const resolver = computed(() => props.resolver || createDefaultResolver());
const layerChoices = [
  { id: 0, label: "Base" }, { id: 1, label: "Layer 1" }, { id: 2, label: "Layer 2" },
];
const ACTION_FAMILIES = [
  { id: "Gamepad", label: "Gamepad", icon: "◉" },
  { id: "Macro", label: "Macros", icon: "M" },
  { id: "Layer", label: "Layers", icon: "L" },
  { id: "Profile", label: "Profiles", icon: "P" },
  { id: "None", label: "Disabled", icon: "—" },
];
const frontHotspots = [
  [0, "□", 71.86, 30.39], [1, "×", 78.71, 41.32],
  [2, "○", 85.43, 30.18], [3, "△", 78.57, 19.89],
  [4, "L1", 27.29, 8.53], [5, "R1", 72.86, 9.61],
  [6, "L2", 16.86, 9.18], [7, "R2", 81.86, 8.96],
  [8, "SH", 31.29, 16.46], [9, "OP", 68.29, 16.03],
  [10, "L3", 35.57, 49.04], [11, "R3", 64.86, 48.82],
  [12, "PS", 50.14, 49.89], [13, "TP", 49.43, 22.68],
  [14, "↑", 21.29, 22.68], [15, "→", 26.57, 31.25],
  [16, "↓", 21.43, 38.11], [17, "←", 16.14, 30.61],
].map(([source, short, x, y]) => ({ source, short, x, y }));
const frontHotspotDraft = ref(frontHotspots.map((hotspot) => ({ ...hotspot })));
const backHotspots = [
  [18, "K1", 27, 36], [19, "K2", 35, 45], [20, "K3", 37, 57], [21, "K4", 30, 68],
  [22, "K5", 73, 36], [23, "K6", 65, 45], [24, "K7", 63, 57], [25, "K8", 70, 68],
].map(([source, short, x, y]) => ({ source, short, x, y }));
const visibleHotspots = computed(() => (
  view.value === "front"
    ? (hotspotDebugEnabled.value ? frontHotspotDraft.value : frontHotspots)
    : backHotspots
));
const debugHotspotCode = computed(() => {
  const entries = frontHotspotDraft.value.map((hotspot) => (
    `  [${hotspot.source}, ${JSON.stringify(hotspot.short)}, ${hotspot.x}, ${hotspot.y}],`
  ));
  return `const frontHotspots = [\n${entries.join("\n")}\n];`;
});
const overrideCount = computed(() => resolver.value.layers.flatMap((layer) => layer.overrides).length);
const stepCount = computed(() => resolver.value.macros.flatMap((macro) => macro.steps).length);
const errors = computed(() => validateResolver(resolver.value));
const capacityWarnings = computed(() => {
  const warnings = [];
  if (overrideCount.value >= 7) warnings.push(`${overrideCount.value}/8 overrides`);
  if (stepCount.value >= 9) warnings.push(`${stepCount.value}/10 macro steps`);
  if (resolver.value.combos.length >= 4) warnings.push(`${resolver.value.combos.length}/4 combos`);
  return warnings;
});
const managerTitle = computed(() => ({
  macros: "Macros",
  layers: "Layers",
}[openManager.value] || ""));
const selectedCombo = computed(() => (
  selectedComboIndex.value === null ? null : resolver.value.combos[selectedComboIndex.value]
));
const selectedTargetName = computed(() => (
  selectedComboIndex.value === null ? SOURCE_NAMES[selectedSource.value] : `Combo ${selectedComboIndex.value + 1}`
));
const selectedTargetMeta = computed(() => (
  selectedComboIndex.value === null
    ? sourceMeta(selectedSource.value)
    : selectedCombo.value ? comboMemberLabel(selectedCombo.value) : "New chord"
));
const selectedTargetAction = computed(() => (
  selectedComboIndex.value === null ? effectiveAction(selectedSource.value) : selectedCombo.value?.action_id ?? ACTION.NONE
));
const recorderExisting = computed(() => (
  macroRecorderSlot.value === null ? null : resolver.value.macros[macroRecorderSlot.value]
));
const recorderStepLimit = computed(() => (
  10 - stepCount.value + (recorderExisting.value?.steps.length || 0)
));
const liveOutputMask = computed(() => {
  let mask = (props.raw?.buttons || 0) & 0x3fff;
  const hat = props.raw?.dpad_hat ?? 8;
  if ([0, 1, 7].includes(hat)) mask |= 1 << 14;
  if ([1, 2, 3].includes(hat)) mask |= 1 << 15;
  if ([3, 4, 5].includes(hat)) mask |= 1 << 16;
  if ([5, 6, 7].includes(hat)) mask |= 1 << 17;
  return mask;
});
const liveOutputLabel = computed(() => (
  SOURCE_NAMES.slice(0, 18).filter((_, index) => liveOutputMask.value & (1 << index)).join(" + ") || "No buttons pressed"
));
const recorderHasInput = computed(() => recordedSteps.value.some((step) => step.output_mask));
const recorderStatusLabel = computed(() => {
  if (recordingWaitingForInput.value) return "Armed — waiting for first controller input";
  if (isRecording.value) return "Recording controller input";
  return recorderDirty.value ? "Recording stopped — steps can be edited" : "Ready to record";
});
const pressedSources = computed(() => {
  const pressed = new Set();
  const buttonMask = props.raw?.buttons || 0;
  for (let source = 0; source < 14; source += 1) {
    if (buttonMask & (1 << source)) pressed.add(source);
  }
  const hat = props.raw?.dpad_hat ?? 8;
  if ([0, 1, 7].includes(hat)) pressed.add(14);
  if ([1, 2, 3].includes(hat)) pressed.add(15);
  if ([3, 4, 5].includes(hat)) pressed.add(16);
  if ([5, 6, 7].includes(hat)) pressed.add(17);
  return pressed;
});
const filteredGroups = computed(() => {
  const query = sourceQuery.value.trim().toLowerCase();
  return SOURCE_GROUPS.map((group) => ({
    ...group,
    sources: group.sources.filter((source) => !query || SOURCE_NAMES[source].toLowerCase().includes(query)
      || (GPIO_NAMES[source] || "").toLowerCase().includes(query)),
  })).filter((group) => group.sources.length);
});
const availableActions = computed(() => ACTION_OPTIONS.filter((action) => (
  action.family !== "Macro" || action.id - ACTION.MACRO_FIRST < resolver.value.macros.length
)));
const comboActions = computed(() => availableActions.value);
const targetActions = computed(() => (
  selectedComboIndex.value === null ? availableActions.value : comboActions.value
));
const actionFamilies = computed(() => ACTION_FAMILIES.map((family) => ({
  ...family,
  count: targetActions.value.filter((action) => action.family === family.id).length,
})));
const activeFamilyMeta = computed(() => (
  actionFamilies.value.find((family) => family.id === activeActionFamily.value) || actionFamilies.value[0]
));
const familyActions = computed(() => (
  targetActions.value.filter((action) => action.family === activeActionFamily.value)
));
const comboCaptureActive = computed(() => (
  comboCaptureState.value === "waiting-neutral" || comboCaptureState.value === "capturing"
));
const comboCaptureLabel = computed(() => ({
  "waiting-neutral": "Release every controller button",
  capturing: "Press and hold the Combo",
  complete: "Combo captured",
  error: "Capture stopped",
}[comboCaptureState.value] || ""));
const comboCaptureDetail = computed(() => {
  if (comboCaptureError.value) return comboCaptureError.value;
  const limited = comboCaptureLimited.value ? " · Legacy firmware: K1–K8 unavailable" : "";
  if (comboCaptureState.value === "waiting-neutral") {
    return `Recording starts from a clean neutral state.${limited}`;
  }
  if (comboCaptureState.value === "capturing") {
    const members = sourceIdsFromMask(comboCaptureMask.value).map((source) => SOURCE_NAMES[source]);
    return `${members.join(" + ") || "Waiting for at least two buttons"}${limited}`;
  }
  if (comboCaptureState.value === "complete") {
    return `${comboMemberLabel(selectedCombo.value)} · Leader: ${SOURCE_NAMES[selectedCombo.value.leader_source_id]}${limited}`;
  }
  return "";
});

watch(liveOutputMask, (mask) => {
  if (!isRecording.value) return;
  const now = performance.now();
  if (recordingWaitingForInput.value) {
    if (mask === 0) return;
    beginRecordingTimeline(mask, now);
    return;
  }
  if (mask === recordingSegmentMask) return;
  if (!appendRecordedSegment(recordingSegmentMask, now - recordingSegmentStartedAt)) {
    stopMacroRecording(false);
    return;
  }
  recordingSegmentMask = mask;
  recordingSegmentStartedAt = now;
});

watch(comboDrawerOpen, (open) => {
  if (!open) resetComboCapture();
});
watch(() => props.connected, (connected) => {
  if (!connected && comboCaptureActive.value) {
    clearComboCaptureTimer();
    comboCaptureState.value = "error";
    comboCaptureError.value = "Controller disconnected during Combo capture.";
  }
});

onBeforeUnmount(() => {
  clearRecordingTimer();
  clearComboCaptureTimer();
});

function cloneResolver() {
  return {
    ...resolver.value,
    base_mapping: [...resolver.value.base_mapping],
    layers: resolver.value.layers.map((layer) => ({ ...layer, overrides: layer.overrides.map((entry) => ({ ...entry })) })),
    combos: resolver.value.combos.map((combo) => ({ ...combo })),
    macros: resolver.value.macros.map((macro) => ({ ...macro, steps: macro.steps.map((step) => ({ ...step })) })),
    reserved: new Uint8Array(resolver.value.reserved || 8),
  };
}
function commit(mutator) { const next = cloneResolver(); mutator(next); emit("update", next); }
function isGamepadAction(actionId) {
  return actionId >= ACTION.GAMEPAD_FIRST && actionId < ACTION.GAMEPAD_FIRST + 18;
}
function openManagerDrawer(manager) {
  inputDrawerOpen.value = false;
  comboDrawerOpen.value = false;
  openManager.value = manager;
}
function toggleInputDrawer() {
  comboDrawerOpen.value = false;
  inputDrawerOpen.value = !inputDrawerOpen.value;
}
function toggleComboDrawer() {
  inputDrawerOpen.value = false;
  comboDrawerOpen.value = !comboDrawerOpen.value;
}
function toggleHotspotDebug() {
  hotspotDebugEnabled.value = !hotspotDebugEnabled.value;
  if (!hotspotDebugEnabled.value) return;
  view.value = "front";
  inputDrawerOpen.value = false;
  comboDrawerOpen.value = false;
  selectedComboIndex.value = null;
  debugSource.value = selectedSource.value < 18 ? selectedSource.value : 0;
  debugCopyStatus.value = "Copy array";
}
function selectDebugSource(sourceId) {
  debugSource.value = sourceId;
  selectedSource.value = sourceId;
  debugCopyStatus.value = "Copy array";
}
function roundHotspotCoordinate(value) {
  return Math.round(value * 100) / 100;
}
function formatHotspotCoordinate(hotspot) {
  return `${hotspot.x.toFixed(2)}%, ${hotspot.y.toFixed(2)}%`;
}
function actionDescriptor(action) {
  if (action.family === "Gamepad") {
    const output = action.id - ACTION.GAMEPAD_FIRST;
    if (output < 4) return "Face button";
    if (output < 8) return "Shoulder / trigger";
    if (output < 14) return "System control";
    return "D-pad direction";
  }
  if (action.family === "Macro") return "Recorded sequence";
  if (action.family === "Layer") return "Mapping layer control";
  if (action.family === "Profile") return "Runtime profile control";
  return "No output";
}
function actionGlyph(action) {
  if (action.family === "Macro") return `M${action.id - ACTION.MACRO_FIRST + 1}`;
  if (action.family === "Layer") return "L";
  if (action.family === "Profile") return "P";
  return "—";
}
function captureHotspotPoint(event) {
  if (!hotspotDebugEnabled.value) return;
  const svg = event.currentTarget.querySelector("svg");
  const matrix = svg?.getScreenCTM();
  const viewBox = svg?.viewBox?.baseVal;
  if (!svg || !matrix || !viewBox?.width || !viewBox?.height) return;

  const clientPoint = svg.createSVGPoint();
  clientPoint.x = event.clientX;
  clientPoint.y = event.clientY;
  const svgPoint = clientPoint.matrixTransform(matrix.inverse());
  if (svgPoint.x < viewBox.x || svgPoint.x > viewBox.x + viewBox.width
      || svgPoint.y < viewBox.y || svgPoint.y > viewBox.y + viewBox.height) return;

  const source = debugSource.value;
  const x = roundHotspotCoordinate(((svgPoint.x - viewBox.x) / viewBox.width) * 100);
  const y = roundHotspotCoordinate(((svgPoint.y - viewBox.y) / viewBox.height) * 100);
  frontHotspotDraft.value = frontHotspotDraft.value.map((hotspot) => (
    hotspot.source === source ? { ...hotspot, x, y } : hotspot
  ));
  debugMarkedSources.value = new Set([...debugMarkedSources.value, source]);
  lastDebugPoint.value = {
    source,
    x: x.toFixed(2),
    y: y.toFixed(2),
    svgX: roundHotspotCoordinate(svgPoint.x),
    svgY: roundHotspotCoordinate(svgPoint.y),
  };
  debugCopyStatus.value = "Copy array";
  if (debugAutoAdvance.value && source < frontHotspotDraft.value.length - 1) {
    selectDebugSource(source + 1);
  }
}
function resetDebugHotspots() {
  frontHotspotDraft.value = frontHotspots.map((hotspot) => ({ ...hotspot }));
  debugMarkedSources.value = new Set();
  lastDebugPoint.value = null;
  debugSource.value = 0;
  debugCopyStatus.value = "Copy array";
}
async function copyDebugHotspots() {
  try {
    await navigator.clipboard.writeText(debugHotspotCode.value);
    debugCopyStatus.value = "Copied";
  } catch {
    debugCopyStatus.value = "Select text";
  }
}
function sourceMeta(sourceId) { return GPIO_NAMES[sourceId] || (sourceId >= 26 ? "GPIO unassigned" : `Source ${sourceId}`); }
function layerOverride(sourceId) { return editingLayer.value ? resolver.value.layers[editingLayer.value - 1].overrides.find((entry) => entry.source_id === sourceId) : null; }
function effectiveAction(sourceId) { return layerOverride(sourceId)?.action_id ?? resolver.value.base_mapping[sourceId]; }
function setView(nextView) {
  view.value = nextView;
  selectSource(nextView === "front" ? 0 : 18);
}
function selectSource(sourceId) {
  selectedComboIndex.value = null;
  selectedSource.value = sourceId;
  activeActionFamily.value = ACTION_OPTIONS.find((action) => action.id === effectiveAction(sourceId))?.family || "Gamepad";
  inputDrawerOpen.value = false;
}
function assignAction(actionId) {
  commit((next) => {
    if (selectedComboIndex.value !== null) next.combos[selectedComboIndex.value].action_id = actionId;
    else if (!editingLayer.value) next.base_mapping[selectedSource.value] = actionId;
    else {
      const entries = next.layers[editingLayer.value - 1].overrides;
      const entry = entries.find((item) => item.source_id === selectedSource.value);
      if (entry) entry.action_id = actionId;
      else if (overrideCount.value < 8) entries.push({ source_id: selectedSource.value, action_id: actionId });
    }
  });
}
function removeOverride(sourceId) { commit((next) => { next.layers[editingLayer.value - 1].overrides = next.layers[editingLayer.value - 1].overrides.filter((entry) => entry.source_id !== sourceId); }); }
function resetSelected() {
  if (selectedComboIndex.value !== null) assignAction(ACTION.NONE);
  else if (editingLayer.value) removeOverride(selectedSource.value);
  else assignAction(selectedSource.value < 18 ? selectedSource.value + 1 : 0);
}
function addCombo() {
  commit((next) => {
    const firstSource = Math.min(next.combos.length * 2, 6);
    next.combos.push({
      input_mask: (3 << firstSource) >>> 0,
      action_id: ACTION.NONE,
      leader_source_id: firstSource,
      consume: true,
      exact: false,
    });
  });
}
function removeCombo(index) {
  resetComboCapture();
  commit((next) => next.combos.splice(index, 1));
}
function selectCombo(index) {
  stopComboCapture();
  resetComboCapture();
  if (index === resolver.value.combos.length) addCombo();
  selectedComboIndex.value = index;
  editingLayer.value = 0;
  const actionId = resolver.value.combos[index]?.action_id ?? ACTION.NONE;
  activeActionFamily.value = ACTION_OPTIONS.find((action) => action.id === actionId)?.family || "None";
}
function closeComboEditor() {
  resetComboCapture();
  selectedComboIndex.value = null;
}
function removeSelectedCombo() {
  if (selectedComboIndex.value === null) return;
  removeCombo(selectedComboIndex.value);
  selectedComboIndex.value = null;
}
function hasComboSource(combo, sourceId) { return !!((combo.input_mask >>> 0) & (1 << sourceId)); }
function comboSources(combo) { return Array.from({ length: 26 }, (_, index) => index).filter((source) => hasComboSource(combo, source)); }
function comboMemberLabel(combo) {
  const names = comboSources(combo).map((source) => SOURCE_NAMES[source]);
  return names.join(" + ") || "No chord members";
}
function clearComboCaptureTimer() {
  if (comboCaptureTimer !== null) window.clearTimeout(comboCaptureTimer);
  comboCaptureTimer = null;
}
function scheduleComboCapture() {
  clearComboCaptureTimer();
  if (comboCaptureActive.value) {
    comboCaptureTimer = window.setTimeout(pollComboCapture, COMBO_CAPTURE_POLL_MS);
  }
}
function resetComboCapture() {
  clearComboCaptureTimer();
  comboCaptureState.value = "idle";
  comboCaptureMask.value = 0;
  comboCaptureLimited.value = false;
  comboCaptureError.value = "";
  comboCaptureTracker = null;
}
function stopComboCapture() {
  clearComboCaptureTimer();
  if (comboCaptureActive.value) comboCaptureState.value = "idle";
}
function startComboCapture() {
  resetComboCapture();
  if (!props.connected || typeof props.readDigitalInput !== "function") {
    comboCaptureState.value = "error";
    comboCaptureError.value = "Connect a controller before recording a Combo.";
    return;
  }
  comboCaptureTracker = createComboCaptureTracker(
    selectedCombo.value?.leader_source_id ?? null,
  );
  comboCaptureState.value = "waiting-neutral";
  scheduleComboCapture();
}
function finishComboCapture(mask, leader) {
  commit((next) => {
    const combo = next.combos[selectedComboIndex.value];
    combo.input_mask = mask >>> 0;
    combo.leader_source_id = leader;
  });
  clearComboCaptureTimer();
  comboCaptureMask.value = mask >>> 0;
  comboCaptureState.value = "complete";
}
async function pollComboCapture() {
  if (!comboCaptureActive.value) return;
  try {
    const snapshot = await props.readDigitalInput();
    const mask = snapshot.digital_mask & 0x03ffffff;
    const now = performance.now();
    comboCaptureLimited.value = !!snapshot.limited;
    comboCaptureMask.value = mask;
    const result = advanceComboCapture(comboCaptureTracker, mask, now);
    comboCaptureState.value = result.phase;
    if (result.complete) {
      finishComboCapture(result.mask, result.leader);
      return;
    }
    scheduleComboCapture();
  } catch (error) {
    clearComboCaptureTimer();
    comboCaptureState.value = "error";
    comboCaptureError.value = error.message;
  }
}
function toggleComboSource(index, sourceId) {
  commit((next) => {
    const combo = next.combos[index];
    combo.input_mask = (combo.input_mask ^ (1 << sourceId)) >>> 0;
    const members = comboSources(combo);
    if (!members.includes(combo.leader_source_id)) combo.leader_source_id = members[0] ?? 0;
  });
}
function updateCombo(index, field, value) { commit((next) => { next.combos[index][field] = value; }); }
function deleteMacro(index) {
  commit((next) => {
    const removedAction = ACTION.MACRO_FIRST + index;
    const remapAction = (action) => {
      if (action === removedAction) return ACTION.NONE;
      return action > removedAction && action < ACTION.MACRO_FIRST + 4 ? action - 1 : action;
    };
    next.base_mapping = next.base_mapping.map(remapAction);
    next.layers.forEach((layer) => layer.overrides.forEach((entry) => { entry.action_id = remapAction(entry.action_id); }));
    next.combos.forEach((combo) => { combo.action_id = remapAction(combo.action_id); });
    next.macros.splice(index, 1);
  });
}
function openMacroRecorder(index) {
  const existing = resolver.value.macros[index];
  macroRecorderSlot.value = index;
  recorderMode.value = existing?.mode ?? 0;
  recordedSteps.value = existing?.steps.map((step) => ({ ...step })) || [];
  recordingWaitingForInput.value = false;
  editingStepIndex.value = null;
  recordingElapsedMs.value = 0;
  recorderDirty.value = false;
}
function clearRecordingTimer() {
  if (recordingTimer !== null) window.clearInterval(recordingTimer);
  recordingTimer = null;
}
function appendRecordedSegment(mask, durationMs) {
  let remaining = Math.max(1, Math.round(durationMs / 4));
  while (remaining > 0) {
    const last = recordedSteps.value.at(-1);
    if (last?.output_mask === mask && last.duration_4ms < 255) {
      const addition = Math.min(remaining, 255 - last.duration_4ms);
      last.duration_4ms += addition;
      remaining -= addition;
      continue;
    }
    if (recordedSteps.value.length >= recorderStepLimit.value) return false;
    const duration_4ms = Math.min(remaining, 255);
    recordedSteps.value.push({ output_mask: mask, duration_4ms });
    remaining -= duration_4ms;
  }
  return true;
}
function beginRecordingTimeline(mask, now = performance.now()) {
  recordingWaitingForInput.value = false;
  recordingStartedAt = now;
  recordingSegmentStartedAt = now;
  recordingSegmentMask = mask;
  clearRecordingTimer();
  recordingTimer = window.setInterval(() => {
    recordingElapsedMs.value = performance.now() - recordingStartedAt;
  }, 20);
}
function startMacroRecording() {
  recordedSteps.value = [];
  editingStepIndex.value = null;
  recorderDirty.value = true;
  isRecording.value = true;
  recordingElapsedMs.value = 0;
  clearRecordingTimer();
  if (recorderStartMode.value === "first-input" && liveOutputMask.value === 0) {
    recordingWaitingForInput.value = true;
    recordingSegmentMask = 0;
    return;
  }
  beginRecordingTimeline(liveOutputMask.value);
}
function stopMacroRecording(captureCurrent = true) {
  if (!isRecording.value) return;
  if (recordingWaitingForInput.value) {
    recordingWaitingForInput.value = false;
    isRecording.value = false;
    recordingElapsedMs.value = 0;
    clearRecordingTimer();
    return;
  }
  const now = performance.now();
  if (captureCurrent) appendRecordedSegment(recordingSegmentMask, now - recordingSegmentStartedAt);
  recordingElapsedMs.value = now - recordingStartedAt;
  isRecording.value = false;
  clearRecordingTimer();
}
function closeMacroRecorder() {
  stopMacroRecording();
  macroRecorderSlot.value = null;
  recordedSteps.value = [];
  recordingWaitingForInput.value = false;
  editingStepIndex.value = null;
  recorderDirty.value = false;
}
function setRecorderMode(mode) {
  if (recorderMode.value === mode) return;
  recorderMode.value = mode;
  recorderDirty.value = true;
}
function toggleRecordedStepEditor(stepIndex) {
  editingStepIndex.value = editingStepIndex.value === stepIndex ? null : stepIndex;
}
function updateRecordedStepDuration(stepIndex, event) {
  const durationMs = Number(event.target.value);
  const duration4ms = Math.max(1, Math.min(255, Math.round(durationMs / 4) || 1));
  recordedSteps.value[stepIndex].duration_4ms = duration4ms;
  event.target.value = duration4ms * 4;
  recorderDirty.value = true;
}
function toggleRecordedStepOutput(stepIndex, outputId) {
  const step = recordedSteps.value[stepIndex];
  const outputBit = 1 << outputId;
  const oppositeDpad = { 14: 16, 15: 17, 16: 14, 17: 15 };
  const adding = (step.output_mask & outputBit) === 0;
  let nextMask = (step.output_mask ^ outputBit) >>> 0;

  if (adding && oppositeDpad[outputId] !== undefined) {
    nextMask &= ~(1 << oppositeDpad[outputId]);
  }
  step.output_mask = nextMask >>> 0;
  recorderDirty.value = true;
}
function setRecordedStepPause(stepIndex) {
  recordedSteps.value[stepIndex].output_mask = 0;
  recorderDirty.value = true;
}
function removeRecordedStep(stepIndex) {
  recordedSteps.value.splice(stepIndex, 1);
  if (editingStepIndex.value === stepIndex) editingStepIndex.value = null;
  else if (editingStepIndex.value > stepIndex) editingStepIndex.value--;
  recorderDirty.value = true;
}
function saveMacroRecording() {
  if (macroRecorderSlot.value === null || !recorderHasInput.value) return;
  const index = macroRecorderSlot.value;
  const macro = {
    mode: recorderMode.value,
    loop: recorderMode.value === 1,
    hold_last: false,
    steps: recordedSteps.value.map((step) => ({ ...step })),
  };
  commit((next) => {
    if (index === next.macros.length) next.macros.push(macro);
    else next.macros[index] = macro;
  });
  closeMacroRecorder();
}
function clearRecordedMacro() {
  if (macroRecorderSlot.value === null) return;
  deleteMacro(macroRecorderSlot.value);
  closeMacroRecorder();
}
function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(2)} s`;
}
function removeLayerEntry(layerIndex, sourceId) { commit((next) => { next.layers[layerIndex].overrides = next.layers[layerIndex].overrides.filter((entry) => entry.source_id !== sourceId); }); }
</script>
