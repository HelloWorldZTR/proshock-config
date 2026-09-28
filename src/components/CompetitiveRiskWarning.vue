<template>
  <aside
    v-if="!riskWarningDismissed"
    class="competitive-risk-warning"
    role="note"
    aria-label="Online-play ban risk"
    data-testid="competitive-risk-warning"
  >
    <ShieldAlert aria-hidden="true" />
    <div>
      <strong>Online-play ban risk</strong>
      <p>Macros and RC filtering may violate game or tournament rules. Use them at your own risk; account bans are your responsibility.</p>
    </div>
    <button class="risk-warning-dismiss" type="button" aria-label="Dismiss" @click="riskWarningDismissed = true">
      <X aria-hidden="true" />
    </button>
  </aside>
</template>

<script setup>
import { ShieldAlert, X } from "@lucide/vue";
import { riskWarningDismissed } from "../risk-warning-state.js";
</script>
