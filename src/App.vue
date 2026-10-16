<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useLocalStorage, useWindowScroll } from '@vueuse/core';
import FormRenderer from './components/FormRenderer.vue';
import { $RefParser, type JSONSchema } from "@apidevtools/json-schema-ref-parser";
import { Buffer } from 'buffer';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './components/ui/tooltip/index.ts';
import { cleanData, matchSchema } from './lib/utils.ts';
import { CORE_FIELDS } from './lib/fieldPolicy.ts';
import DropZone from './components/DropZone.vue';
import { Toaster } from './components/ui/sonner/index.ts';
import { toast } from 'vue-sonner';
import { Button } from './components/ui/button/index.ts';
import { ButtonGroup } from './components/ui/button-group/index.ts';
import { Skeleton } from './components/ui/skeleton/index.ts';
import ConfirmDialog from './components/ConfirmDialog.vue';
import { ChevronsDownUp, ChevronsUpDown, ClipboardCopy, Cog, Download, FileDown, Import, Trash } from '@lucide/vue';
import { parse, stringify } from 'yaml';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog/index.ts';
import { provideCollapsibleState } from './composables/useCollapsibleState.ts';
import { provideValidationState } from './composables/useValidationState.ts';
import { provideFieldVisibility } from './composables/useFieldVisibility.ts';

const SCHEMA_URL = "https://raw.githubusercontent.com/rendercv/rendercv/refs/tags/v2.8/schema.json";

/** The four top-level keys of a RenderCV document. `cv` is the main content. */
const DOC_KEYS = ['cv', 'design', 'locale', 'settings'] as const;
type DocKey = typeof DOC_KEYS[number];
type ConfigKey = Exclude<DocKey, 'cv'>;

const emptyDoc = () => ({ cv: {} as any, design: {} as any, locale: {} as any, settings: {} as any });

const stored = useLocalStorage("rendercv-draft", emptyDoc());

const schemaString = useLocalStorage("rendercv-schema", "");
const schema = ref<undefined | JSONSchema>();
const schemas = ref<undefined | Record<DocKey, JSONSchema>>();
const cvSchema = computed(() => schemas.value?.cv);

const collapse = provideCollapsibleState();
const validation = provideValidationState();
const visibility = provideFieldVisibility();

/** Config sections live behind the settings dialog. */
const CONFIG_SECTIONS: Array<{ key: ConfigKey; label: string }> = [
  { key: 'design', label: 'Design' },
  { key: 'locale', label: 'Locale' },
  { key: 'settings', label: 'Settings' },
];
const activeTab = ref<ConfigKey>('design');
const settingsOpen = ref(false);
const configSchema = computed(() => schemas.value?.[activeTab.value]);

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
  schemas.value = {
    cv: (resolved as any).$defs.Cv,
    design: (resolved as any).$defs.BuiltInDesign,
    locale: (resolved as any).$defs.Locale,
    settings: (resolved as any).$defs.Settings,
  };
});

const dialogOpen = ref(false);
const onDrop = (yamlContents: string) => {
  try {
    const convJson = parse(yamlContents) ?? {};
    const next = emptyDoc();

    if (convJson.cv && typeof convJson.cv === 'object') {
      next.cv = convJson.cv;
      const sections = convJson.cv.sections;
      const sectionsSchema = (cvSchema.value?.properties as any)?.sections;
      if (sections && typeof sections === 'object' && sectionsSchema) {
        sections.$schemas = Object.entries(sections).map(([key, obj]) => ({
          $key: key, $schema: matchSchema(obj, sectionsSchema),
        }));
      }
    }

    for (const key of ['design', 'locale', 'settings'] as const) {
      if (convJson[key] && typeof convJson[key] === 'object') next[key] = convJson[key];
    }

    stored.value = next;
    visibility.reset();
    toast.success("YAML loaded");
    dialogOpen.value = false;
  } catch (e: any) {
    toast.error("Error while parsing YAML:", e);
    console.error(e);
  }
}

/** Build the full document, dropping anything left empty. */
const buildOutput = () => {
  const out: any = {};
  for (const key of DOC_KEYS) {
    const cleaned = cleanData(stored.value[key]);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  if (!('cv' in out)) out.cv = {};
  // Keep `cv` first for readability.
  return { cv: out.cv, ...out };
};

const outputYaml = computed(() => stringify(buildOutput()));

const validateForExport = async () => {
  // Reveal every required-field error before exporting.
  validation.request();
  await nextTick();
  if (validation.invalid.size > 0) {
    toast.error("Fill in the required fields before exporting");
    return false;
  }
  return true;
};

const onCopy = async () => {
  if (!(await validateForExport())) return;
  navigator.clipboard.writeText(outputYaml.value)
    .then(() => toast.success("YAML copied to clipboard"))
    .catch(() => toast.error("Could not update clipboard"));
}

const onDownload = async () => {
  if (!(await validateForExport())) return;
  const blob = new Blob([outputYaml.value], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "rendercv.yaml";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast.success("Downloaded rendercv.yaml");
}

const onClear = () => {
  stored.value = emptyDoc();
  visibility.reset();
  toast.success("Form cleared");
}
</script>

<template>
  <TooltipProvider>
    <div class="max-w-2xl mx-auto flex flex-col gap-2 px-2 pb-8">
      <h1 class="mt-3 text-center text-3xl sm:text-4xl font-bold tracking-tight text-balance">
        RenderCV Editor
      </h1>

      <template v-if="cvSchema">
        <ButtonGroup
          class="w-full sticky top-0 z-10 p-2 flex flex-row flex-wrap items-center gap-2 justify-center bg-background/80 backdrop-blur-md transition-shadow"
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

          <Dialog>
            <DialogTrigger as-child>
              <Button>
                <Download /> Export
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Export YAML</DialogTitle>
                <DialogDescription>
                  Copy your RenderCV document to the clipboard, or download it as a file.
                </DialogDescription>
              </DialogHeader>
              <pre
                class="max-h-64 overflow-auto border bg-muted/40 p-2 text-xs leading-relaxed whitespace-pre-wrap break-words">{{ outputYaml }}</pre>
              <DialogFooter>
                <Button variant="outline" @click="onDownload">
                  <FileDown /> Download .yaml
                </Button>
                <Button @click="onCopy">
                  <ClipboardCopy /> Copy YAML
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog v-model:open="settingsOpen">
            <DialogTrigger as-child>
              <Button variant="secondary">
                <Cog />
              </Button>
            </DialogTrigger>
            <DialogContent
              class="flex flex-col gap-0 w-full max-w-none h-[100dvh] max-h-none overflow-hidden p-0 top-0 left-0 translate-x-0 translate-y-0 sm:h-auto sm:max-w-2xl sm:max-h-[85vh] sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
              <div class="flex shrink-0 flex-col gap-2 border-b p-4 pr-12">
                <DialogHeader>
                  <DialogTitle>Design, Locale &amp; Settings</DialogTitle>
                  <DialogDescription>
                    These sections are optional — RenderCV uses its defaults for anything left empty.
                  </DialogDescription>
                </DialogHeader>
                <div class="-mx-1 flex flex-row gap-1 overflow-x-auto overflow-y-hidden" role="tablist" aria-label="Configuration sections">
                  <Button v-for="section in CONFIG_SECTIONS" :key="section.key" type="button" size="sm"
                    role="tab" :aria-selected="activeTab === section.key"
                    class="flex-1 shrink-0 sm:flex-none"
                    :variant="activeTab === section.key ? 'secondary' : 'ghost'"
                    @click="activeTab = section.key">
                    {{ section.label }}
                  </Button>
                </div>
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <FormRenderer v-if="configSchema" :key="activeTab" :schema="configSchema"
                  v-model="stored[activeTab]" :path="activeTab" root />
              </div>
            </DialogContent>
          </Dialog>

          <ConfirmDialog title="Clear the form?"
            description="This removes every value from the editor and cannot be undone." confirm-label="Clear"
            @confirm="onClear">
            <template #trigger>
              <Button variant="secondary">
                <Trash />
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

        <FormRenderer :schema="cvSchema" v-model="stored.cv" root :core-fields="CORE_FIELDS.root" />
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
