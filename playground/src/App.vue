<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useLocalStorage, useWindowScroll } from '@vueuse/core';
import {
  FormRenderer,
  ConfirmDialog,
  CORE_FIELDS,
  emptyDoc,
  docToYaml,
  yamlToDoc,
  provideFormState,
  type ConfigKey,
  type RenderCvSchemas,
} from '@r3dacted42/rendercv-form';
import { loadSchemas } from '@r3dacted42/rendercv-form/schema';
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Button,
  ButtonGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@r3dacted42/rendercv-form/ui';
import DropZone from './components/DropZone.vue';
import { Skeleton } from './components/ui/skeleton';
import { Toaster } from './components/ui/sonner';
import { toast } from 'vue-sonner';
import { ChevronsDownUp, ChevronsUpDown, ClipboardCopy, Cog, Download, FileDown, Import, Trash } from '@lucide/vue';

const stored = useLocalStorage("rendercv-draft", emptyDoc());

const schemaString = useLocalStorage("rendercv-schema", "");
const schemas = ref<RenderCvSchemas>();
const cvSchema = computed(() => schemas.value?.cv);

const form = provideFormState();

/** Config sections live behind the settings dialog. */
const CONFIG_SECTIONS: Array<{ key: ConfigKey; label: string }> = [
  { key: 'design', label: 'Design' },
  { key: 'locale', label: 'Locale' },
  { key: 'settings', label: 'Settings' },
];
const activeTab = ref<ConfigKey>('design');
const settingsOpen = ref(false);
const exportOpen = ref(false);
const configSchema = computed(() => schemas.value?.[activeTab.value]);

/** Header shadow --------------------------------------------------------- */
const { y } = useWindowScroll();
const isScrolled = computed(() => y.value > 8);

onMounted(async () => {
  schemas.value = await loadSchemas({
    text: schemaString.value || undefined,
    onText: (text) => { schemaString.value = text; },
  });
});

const dialogOpen = ref(false);
const onDrop = (yamlContents: string) => {
  if (!schemas.value) return;
  try {
    stored.value = yamlToDoc(yamlContents, schemas.value);
    form.reset();
    toast.success("YAML loaded");
    dialogOpen.value = false;
  } catch (e: any) {
    toast.error("Error while parsing YAML:", e);
    console.error(e);
  }
}

const outputYaml = computed(() => docToYaml(stored.value));

const validateForExport = async () => {
  // Reveal every required-field error before exporting.
  if (!(await form.validate())) {
    toast.error("Fill in the required fields before exporting");
    return false;
  }
  return true;
};

const onCopy = async () => {
  if (!(await validateForExport())) return;
  navigator.clipboard.writeText(outputYaml.value)
    .then(() => {
      toast.success("YAML copied to clipboard");
      exportOpen.value = false;
    })
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
  exportOpen.value = false;
}

const onClear = () => {
  stored.value = emptyDoc();
  form.reset();
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
        <div
          class="w-full sticky top-0 z-10 p-2 flex flex-row flex-wrap items-center gap-2 justify-center bg-background/80 backdrop-blur-md transition-shadow"
          :class="isScrolled && 'border-b border-border shadow-sm'">
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

          <Dialog v-model:open="exportOpen">
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
            <Tooltip>
              <TooltipTrigger as-child>
                <DialogTrigger as-child>
                  <Button variant="secondary" aria-label="Design, locale & settings">
                    <Cog />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Design, locale &amp; settings</TooltipContent>
            </Tooltip>
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

          <Tooltip>
            <ConfirmDialog title="Clear the form?"
              description="This removes every value from the editor and cannot be undone." confirm-label="Clear"
              @confirm="onClear">
              <template #trigger>
                <TooltipTrigger as-child>
                  <Button variant="secondary" aria-label="Clear the form">
                    <Trash />
                  </Button>
                </TooltipTrigger>
              </template>
            </ConfirmDialog>
            <TooltipContent>Clear the form</TooltipContent>
          </Tooltip>

          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="outline" size="icon" aria-label="Collapse all sections"
                  @click="form.collapseAll()">
                  <ChevronsDownUp />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Collapse all</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="outline" size="icon" aria-label="Expand all sections" @click="form.expandAll()">
                  <ChevronsUpDown />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Expand all</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </div>

        <FormRenderer :schema="cvSchema" v-model="stored.cv" root :core-fields="CORE_FIELDS.root" />
      </template>

      <template v-else>
        <div class="flex flex-col gap-2" aria-busy="true" aria-live="polite">
          <Skeleton v-for="i in 3" :key="i" class="h-32 w-full" />
          <Skeleton class="h-9 w-44" />
        </div>
        <p class="text-center text-xs text-muted-foreground">
          Loading the latest RenderCV schema…
        </p>
      </template>
    </div>
  </TooltipProvider>
  <Toaster position="top-right" />
</template>
