<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useLocalStorage, useWindowScroll } from '@vueuse/core';
import FormRenderer from './components/FormRenderer.vue';
import { $RefParser, type JSONSchema } from "@apidevtools/json-schema-ref-parser";
import { Buffer } from 'buffer';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './components/ui/tooltip/index.ts';
import { cleanData, matchSchema } from './lib/utils.ts';
import DropZone from './components/DropZone.vue';
import { Toaster } from './components/ui/sonner/index.ts';
import { toast } from 'vue-sonner';
import { Button } from './components/ui/button/index.ts';
import { ButtonGroup } from './components/ui/button-group/index.ts';
import { Skeleton } from './components/ui/skeleton/index.ts';
import ConfirmDialog from './components/ConfirmDialog.vue';
import { ChevronsDownUp, ChevronsUpDown, ClipboardCopy, Import, Trash } from '@lucide/vue';
import { parse, stringify } from 'yaml';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog/index.ts';
import { provideCollapsibleState } from './composables/useCollapsibleState.ts';
import { provideValidationState } from './composables/useValidationState.ts';

const SCHEMA_URL = "https://raw.githubusercontent.com/rendercv/rendercv/refs/tags/v2.8/schema.json";

const schemaString = useLocalStorage("rendercv-schema", "");
const schema = ref<undefined | JSONSchema>();
const cvSchema = ref<undefined | JSONSchema>();
const data = useLocalStorage("rendercv-draft", {} as any);

const collapse = provideCollapsibleState();
const validation = provideValidationState();

/** Header shadow --------------------------------------------------------- */
const { y } = useWindowScroll();
const isScrolled = computed(() => y.value > 8);

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

const onCopy = async () => {
  // Reveal every required-field error before exporting.
  validation.request();
  await nextTick();
  if (validation.invalid.size > 0) {
    toast.error("Fill in the required fields before copying");
    return;
  }
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
        <ButtonGroup
          class="w-full sticky top-0 z-10 p-2 flex flex-row gap-2 justify-center bg-background/80 backdrop-blur-md transition-shadow"
          :class="isScrolled && 'border-b shadow-sm'">
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
          <ConfirmDialog title="Clear the form?"
            description="This removes every value from the form and cannot be undone." confirm-label="Clear form"
            @confirm="onClear">
            <template #trigger>
              <Button variant="secondary">
                <Trash /> Clear Form
              </Button>
            </template>
          </ConfirmDialog>

          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="outline" size="icon" aria-label="Collapse all sections"
                  @click="collapse.collapseAll()">
                  <ChevronsDownUp />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Collapse all</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="outline" size="icon" aria-label="Expand all sections" @click="collapse.expandAll()">
                  <ChevronsUpDown />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Expand all</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </ButtonGroup>

        <FormRenderer :schema="cvSchema" v-model="data" />
      </template>

      <template v-else>
        <div class="flex flex-col gap-2" aria-busy="true" aria-live="polite">
          <Skeleton v-for="i in 3" :key="i" class="h-32 w-full" />
          <Skeleton class="h-9 w-44" />
        </div>
        <p class="text-center text-xs text-muted-foreground">
          {{ schema ? 'Resolving schema references…' : 'Downloading the latest RenderCV schema…' }}
        </p>
      </template>
    </div>
  </TooltipProvider>
  <Toaster position="top-right" />
</template>
