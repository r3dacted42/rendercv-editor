<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import FormRenderer from './components/FormRenderer.vue';
import { $RefParser, type JSONSchema } from "@apidevtools/json-schema-ref-parser";
import { Buffer } from 'buffer';
import { TooltipProvider } from './components/ui/tooltip/index.ts';
import { JSONtoYAML } from './lib/converters.ts';

const SCHEMA_URL = "https://raw.githubusercontent.com/rendercv/rendercv/refs/tags/v2.8/schema.json";

const schemaString = useLocalStorage("rendercv-schema", "");
const schema = ref<undefined | JSONSchema>();
const cvSchema = ref<undefined | JSONSchema>();
const data = useLocalStorage("rendercv-draft", {} as any);

onMounted(async () => {
  if (!schemaString.value) {
    const res = await fetch(SCHEMA_URL);
    schemaString.value = await res.text();
  }
  schema.value = JSON.parse(schemaString.value);
  // @ts-ignore
  window.Buffer = Buffer;
  const resolved = await $RefParser.dereference(schema.value);
  cvSchema.value = (resolved as any).$defs.Cv;
});

const debug = computed(() => JSONtoYAML({ cv: data.value }));
</script>

<template>
  <pre class="absolute overflow-clip" style="color: #fff3;">{{ debug }}</pre>
  <TooltipProvider>
    <div class="max-w-lg mx-auto">
      <h1 class="scroll-m-20 text-center text-4xl font-bold tracking-tight text-balance mb-2">
        RenderCV Editor
      </h1>
      <FormRenderer v-if="cvSchema" :schema="cvSchema" v-model="data" />
      <template v-else-if="schema && !cvSchema">
        <p>resolving references in schema...</p>
      </template>
      <template v-else>
        <p>downloading latest rendercv schema...</p>
      </template>
    </div>
  </TooltipProvider>
</template>
