<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import FormRenderer from './components/FormRenderer.vue';
import { $RefParser, type JSONSchema } from "@apidevtools/json-schema-ref-parser";
import { Buffer } from 'buffer';
import { TooltipProvider } from './components/ui/tooltip/index.ts';
import { cleanData, matchSchema } from './lib/utils.ts';
import DropZone from './components/DropZone.vue';
import { Toaster } from './components/ui/sonner/index.ts';
import { toast } from 'vue-sonner';
import { Button } from './components/ui/button/index.ts';
import { ButtonGroup } from './components/ui/button-group/index.ts';
import { ClipboardCopy, Import, Trash } from '@lucide/vue';
import { parse, stringify } from 'yaml';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog/index.ts';

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

const dialogOpen = ref(false);
const onDrop = (yamlContents: string) => {
  try {
    const convJson = parse(yamlContents);
    convJson.cv.sections.$schemas = Object.entries(convJson.cv.sections).map(([key, obj]) => ({
      $key: key, $schema: matchSchema(obj, (cvSchema.value?.properties as any).sections)
    }));
    data.value = convJson.cv;
    toast.success("YAML loaded");
    dialogOpen.value = false;
  } catch (e: any) {
    toast.error("Error while parsing YAML:", e);
    console.error(e);
  }
}

const onCopy = () => {
  navigator.clipboard.writeText(stringify({ cv: cleanData(data.value) }))
    .then(() => toast.success("YAML copied to clipboard"))
    .catch(() => toast.error("Could not update clipboard"));
}

const onClear = () => {
  data.value = {};
  toast.success("Form cleared");
}
</script>

<template>
  <TooltipProvider>
    <div class="max-w-2xl mx-auto flex flex-col gap-2">
      <h1 class="mt-3 text-center text-4xl font-bold tracking-tight text-balance">
        RenderCV Editor
      </h1>

      <template v-if="cvSchema">
        <ButtonGroup class="w-full sticky top-0 p-2 bg-linear-to-b from-(--background) to-[transparent] flex flex-row gap-2 justify-center z-1">
          <Dialog v-model:open="dialogOpen">
            <DialogTrigger as-child>
              <Button>
                <Import /> Import
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import YAML</DialogTitle>
                <DialogDescription>
                  The form will be auto-filled with data from the uploaded file.
                </DialogDescription>
              </DialogHeader>
              <DropZone @file-drop="onDrop" />
            </DialogContent>
          </Dialog>
          <Button @click="onCopy">
            <ClipboardCopy /> Copy YAML
          </Button>
          <Button variant="secondary" @click="onClear">
            <Trash /> Clear Form
          </Button>
        </ButtonGroup>

        <FormRenderer :schema="cvSchema" v-model="data" />
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
