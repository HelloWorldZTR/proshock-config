<template>
  <section class="profile-strip" aria-label="Profile slots">
    <button
      v-for="profile in profiles"
      :key="profile.index"
      type="button"
      class="profile-segment"
      :class="{ active: profile.index === active, selected: profile.index === selected }"
      :disabled="disabled"
      @click="$emit('select', profile.index)"
    >
      <i :style="{ background: profile.hex }"></i>
      <span>
        <strong>Slot {{ profile.index + 1 }}</strong>
        <small>{{ profile.index === active ? "Active" : profile.index === boot ? "Boot" : "Profile" }}</small>
      </span>
      <span class="profile-badges">
        <b v-if="profile.index === active">Active</b>
        <b v-if="profile.index === boot" class="boot">Boot</b>
      </span>
      <span class="edit-link" @click.stop="$emit('edit', profile.index)">Edit</span>
    </button>
  </section>
</template>

<script setup>
defineProps({
  profiles: { type: Array, required: true },
  active: { type: Number, default: 0 },
  boot: { type: Number, default: 0 },
  selected: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
});
defineEmits(["select", "edit"]);
</script>
