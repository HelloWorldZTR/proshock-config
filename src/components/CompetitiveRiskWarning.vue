<template>
  <aside
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
  </aside>
</template>

<script setup>
import { ShieldAlert } from "@lucide/vue";
</script>
