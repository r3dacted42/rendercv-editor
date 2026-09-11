<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { ref } from 'vue';

const hovering = ref(false);
const emit = defineEmits<{ fileDrop: [string] }>();

useEventListener(document.documentElement, "drop", async (e: DragEvent) => {
  e.preventDefault();
  hovering.value = false;
  if (!e.dataTransfer) return;
  const file = [...e.dataTransfer.items].filter(i => i.kind === 'file')[0];
  if (!file) return;
  const fileURL = URL.createObjectURL(file.getAsFile()!);
  const res = await fetch(fileURL);
  const blob = await res.blob();
  const textContent = await blob.text();
  emit('fileDrop', textContent);
});

useEventListener(document.documentElement, "dragover", (e: DragEvent) => {
  if (!e.dataTransfer) return;
  e.preventDefault();
  const files = [...e.dataTransfer.items].filter(i => i.kind === 'file');
  if (files.length === 1) hovering.value = true;
});

useEventListener(document.documentElement, "dragleave", () => {
  hovering.value = false;
});
</script>

<template>
  <div>
    <slot></slot>
  </div>
  <div v-if="hovering" class="hover-indicator flex flex-col p-3">
    <div class="border rounded-sm border-dashed flex-grow">
      drop rendercv YAML here
    </div>
  </div>
</template>

<style lang="css" scoped>
.hover-indicator {
  pointer-events: none;
  position: fixed;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  background-color: #0007;
}
</style>