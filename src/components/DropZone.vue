<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { ref, useTemplateRef } from 'vue';

const dropZone = useTemplateRef("drop-zone");
const hovering = ref(false);
const dragCount = ref(0);
const emit = defineEmits<{ fileDrop: [string] }>();

useEventListener(dropZone, "dragover", (e: DragEvent) => {
  e.preventDefault();
});

useEventListener(dropZone, "drop", async (e: DragEvent) => {
  e.preventDefault();
  dragCount.value = 0;
  hovering.value = false;

  if (!e.dataTransfer) return;
  const item = [...e.dataTransfer.items].find(i => i.kind === 'file');
  if (!item) return;
  const file = item.getAsFile();
  if (!file) return;
  const textContent = await file.text();
  emit('fileDrop', textContent);
});

useEventListener(dropZone, "dragenter", (e: DragEvent) => {
  e.preventDefault();
  if (!e.dataTransfer) return;
  
  // types.includes is much more reliable across browsers during the dragenter phase
  if (e.dataTransfer.types.includes('Files')) {
    dragCount.value++;
    if (dragCount.value === 1) {
      hovering.value = true;
    }
  }
});

useEventListener(dropZone, "dragleave", (e: DragEvent) => {
  e.preventDefault();
  if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
  
  dragCount.value--;
  if (dragCount.value === 0) {
    hovering.value = false;
  }
});
</script>

<template>
  <div ref="drop-zone" class="relative">
    <slot></slot>
    <div v-if="hovering" class="hover-indicator flex flex-col p-3">
      <div class="border border-dashed flex-grow p-3 text-center">
        drop rendercv YAML here
      </div>
    </div>
  </div>
</template>

<style lang="css" scoped>
.hover-indicator {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  background-color: #0007;
  pointer-events: none;
}
</style>