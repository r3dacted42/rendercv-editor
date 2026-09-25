<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { computed, ref, useTemplateRef } from 'vue';

const dropZone = useTemplateRef("drop-zone");
const dropInput = useTemplateRef("drop-input");
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

useEventListener(dropInput, "change", async (e: InputEvent) => {
  e.preventDefault();
  if (!e.target) return;
  const elem = e.target as HTMLInputElement;
  if (elem.files && elem.files.length == 1 && elem.files[0]) {
    const textContent = await elem.files[0].text();
    emit('fileDrop', textContent);
  }
});

const message = computed(() => hovering.value ? "drop rendercv YAML file here" : "click to select or drop file");
</script>

<template>
  <label ref="drop-zone"
    class="min-h-50 block cursor-pointer border border-dashed p-3 flex justify-center items-center">
    {{ message }}
    <input ref="drop-input" type="file" style="display: none;">
  </label>
</template>
