<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import FormRenderer from './components/FormRenderer.vue';
import { $RefParser, type JSONSchema } from "@apidevtools/json-schema-ref-parser";
import { Buffer } from 'buffer';
import { TooltipProvider } from './components/ui/tooltip/index.ts';
import { JSONtoYAML, YAMLtoJSON } from './lib/converters.ts';
import { matchSchema } from './lib/utils.ts';
import DropZone from './components/DropZone.vue';
import { Toaster } from './components/ui/sonner/index.ts';
import { toast } from 'vue-sonner';
import { Button } from './components/ui/button/index.ts';
import { ButtonGroup } from './components/ui/button-group/index.ts';
import { ClipboardCopy, Trash } from '@lucide/vue';

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

const onDrop = (yamlContents: string) => {
  try {
    const convJson = YAMLtoJSON(yamlContents);
    convJson.cv.sections.$schemas = Object.entries(convJson.cv.sections).map(([key, obj]) => ({
      $key: key, $schema: matchSchema(obj, (cvSchema.value?.properties as any).sections)
    }));
    data.value = convJson.cv;
    toast.success("YAML loaded");
  } catch {
    console.warn("dropped file is not valid YAML");
    toast.error("Error while parsing YAML");
  }
}

const onClear = () => {
  data.value = {};
  toast.success("Form cleared");
}

const onCopy = () => {
  navigator.clipboard.writeText(JSONtoYAML({ cv: data.value }))
    .then(() => toast.success("YAML copied to clipboard"))
    .catch(() => toast.error("Could not update clipboard"));
}
</script>

<template>
  <TooltipProvider>
    <div class="max-w-2xl mx-auto flex flex-col gap-2">
      <h1 class="scroll-m-20 text-center text-4xl font-bold tracking-tight text-balance">
        RenderCV Editor
      </h1>
      <template v-if="cvSchema">
        <ButtonGroup class="flex flex-row gap-2 self-center">
          <Button @click="onCopy">
            <ClipboardCopy /> Copy YAML
          </Button>
          <Button variant="secondary" @click="onClear">
            <Trash /> Clear Form
          </Button>
        </ButtonGroup>
        <DropZone @file-drop="onDrop">
          <FormRenderer :schema="cvSchema" v-model="data" />
        </DropZone>
      </template>
      <template v-else-if="schema && !cvSchema">
        <p>resolving references in schema...</p>
      </template>
      <template v-else>
        <p>downloading latest rendercv schema...</p>
      </template>
    </div>
  </TooltipProvider>
  <Toaster position="top-right" />
</template>
