<script setup lang="ts">
import type { FormRendererUi, JsonSchema } from '../lib/types';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Field, FieldError, FieldLabel, FieldSet } from './ui/field';
import { Button } from './ui/button';
import { CheckIcon, ChevronRightIcon, InfoIcon, MinusIcon, PlusIcon, XIcon } from '@lucide/vue';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { PopoverClose } from 'reka-ui';
import { computed, onScopeDispose, reactive, ref, watchEffect } from 'vue';
import { cleanData, cn, removeTrailingS, toTitleCase } from '@/lib/utils';
import { isMultiline } from '@/lib/fieldHints';
import { findExclusiveGroups, isBlank, isFilled, isOptional, type ExclusiveGroup } from '@/lib/fieldPolicy';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupTextarea } from './ui/input-group';
import { ButtonGroup } from './ui/button-group';
import ConfirmDialog from './ConfirmDialog.vue';
import { useOrProvideFormState } from '@/composables/useFormState';
import type { ExclusiveMode } from '@/composables/useFieldVisibility';

const data = defineModel<any>({ required: true });

let {
  schema,
  onDelete,
  userDefKey,
  title,
  path = '',
  variant = 'group',
  root = false,
  coreFields,
  storageKey,
  persist = true,
  hydrate,
  ui,
} = defineProps<{
  schema: JsonSchema,
  onDelete?: Function,
  userDefKey?: string,
  title?: string,
  /** Stable location of this group in the form, used to persist its collapse state. */
  path?: string,
  /** 'item' renders the fields inline (no header) — used for entries inside an array group. */
  variant?: 'group' | 'item',
  /** Marks a top-level section root. Optional chips sit beside `sections` when present. */
  root?: boolean,
  /** Optional fields rendered at the root by default (the CV header fields). */
  coreFields?: string[],
  /**
   * Namespace for the persisted UI state. Only used when this renderer owns the
   * state (i.e. no ancestor called `provideFormState`/`provideCollapsibleState`).
   */
  storageKey?: string,
  /** Persist collapse/disclosure to localStorage. Only used when this renderer owns the state. */
  persist?: boolean,
  /**
   * When to restore persisted UI state (default `immediate`). Pass `mounted` when
   * the renderer is part of an SSR shell, so the first client render matches the
   * server-rendered markup. Only used when this renderer owns the state.
   */
  hydrate?: 'immediate' | 'mounted',
  /** Extra classes for named regions (see `FormRendererUi`). */
  ui?: FormRendererUi,
}>();

/**
 * UI state (collapse, validation, disclosure) is shared through provide/inject.
 * `useOrProvideFormState` reuses an ancestor's state when there is one — so a
 * lone renderer is self-contained, while an app can share one state (and one
 * "collapse all") across several renderers via `provideFormState`.
 */
const form = useOrProvideFormState({ storageKey, persist, hydrate });
const validation = form.validation;
const visibility = form.visibility;

/* Discriminated unions (themes, locales) ---------------------------------- */

interface UnionOption { key: string; label: string; schema: any }

/** Discriminator values that don't humanise cleanly from the raw const. */
const VARIANT_LABELS: Record<string, string> = {
  engineeringclassic: 'Engineering Classic',
  engineeringresumes: 'Engineering Résumés',
};

/**
 * `design` and `locale` are tagged unions (`oneOf` + `discriminator`). We read
 * the discriminator's `const` off each variant to build the options and let
 * the user pick a variant, which is stored back on the discriminator property.
 */
const union = computed(() => {
  const s: any = schema;
  if (!s || !s.oneOf || !s.discriminator?.propertyName) return null;
  const propertyName = s.discriminator.propertyName as string;
  const options = (s.oneOf as Array<any>)
    .map((variant): UnionOption | null => {
      const key = variant?.properties?.[propertyName]?.const;
      if (!key) return null;
      const value = String(key);
      return { key: value, label: VARIANT_LABELS[value] ?? toTitleCase(value.replace(/_/g, ' ')), schema: variant };
    })
    .filter((option): option is UnionOption => option !== null);
  return options.length ? { propertyName, options } : null;
});

const unionKey = computed<string | undefined>(() =>
  union.value ? data.value?.[union.value.propertyName] : undefined,
);

const selectedVariant = computed(() => {
  if (!union.value) return null;
  return union.value.options.find((option) => option.key === unionKey.value) ?? union.value.options[0];
});

/** The object whose properties are actually rendered (a union variant when present). */
const currentSchema = computed<any>(() => selectedVariant.value?.schema ?? schema);

/* Basic schema helpers --------------------------------------------------- */

const getPropTitle = (prop: any, key: string) => prop.title as string ||
  key.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');

const hasType = (prop: any, type: string) => prop.anyOf && Array.isArray(prop.anyOf)
  && (prop.anyOf as Array<any>).reduce((acc, d) => acc || d.type === type, false);

const getArrayItems = (prop: any) => prop.anyOf && Array.isArray(prop.anyOf)
  && (prop.anyOf as Array<any>).reduce((acc, d) => {
    if (!acc && d.type === "array") return d.items;
    return acc;
  }, null);

/** A plain `type: string`/`boolean`/… (or a single non-null `anyOf` variant). */
const propType = (prop: any): string | undefined => {
  if (!prop) return undefined;
  if (typeof prop.type === 'string') return prop.type;
  const variants = prop.anyOf ?? prop.oneOf;
  if (Array.isArray(variants)) {
    const types = variants.map((v: any) => v?.type).filter((t: any) => t && t !== 'null');
    if (types.length === 1) return types[0];
  }
  return undefined;
};

const isBooleanProp = (prop: any) => propType(prop) === 'boolean';

/** The allowed values of a plain enum, or the scalar enum sitting inside an object|scalar union. */
const scalarEnumOf = (prop: any): Array<string> | undefined => {
  if (Array.isArray(prop?.enum)) return prop.enum;
  const variants = prop?.anyOf ?? prop?.oneOf;
  if (!Array.isArray(variants)) return undefined;
  // Only lift the enum for unions that also offer an object form (e.g. font_family),
  // so plain unions like `date` are left as free-text inputs.
  if (!variants.some((v: any) => v?.type === 'object' || v?.properties)) return undefined;
  const withEnum = variants.find((v: any) => Array.isArray(v?.enum));
  return withEnum ? withEnum.enum : undefined;
};

/** Arrays of scalars (e.g. `highlights`) get one shared group; object arrays keep per-entry groups. */
const isPrimitiveArray = (prop: any) => {
  const items = getArrayItems(prop);
  return !!items && items.type !== 'object';
};

const addArrayItem = (prop: any, key: string) => {
  const items = getArrayItems(prop);
  const newItem = items?.type === "object" ? {} : "";
  if (data.value[key] && Array.isArray(data.value[key])) data.value[key].push(newItem);
  else data.value[key] = Array(newItem);
}

const getObjectOptions = (prop: any) => {
  if (!(prop.anyOf && Array.isArray(prop.anyOf))) return null;
  return (prop.anyOf as Array<any>).reduce((acc, d) => {
    if (!acc && d.type === "object") return d.additionalProperties.anyOf;
    return acc;
  }, null) as Array<any> | null;
}

/** `sections`-style maps: an object whose entries each match one of several schemas. */
const hasSectionOptions = (prop: any) => {
  const options = getObjectOptions(prop);
  return Array.isArray(options) && options.length > 0;
};

/** A structured object with named properties (rendered recursively, not as a section map). */
const isPlainObject = (prop: any) =>
  !!prop && (prop.type === 'object' || hasType(prop, 'object')) && !!prop.properties && !hasSectionOptions(prop);

/* Section maps: add/remove free-form keys --------------------------------- */

const popoverData = ref({} as any);

const isPopoverDataValid = computed(() => !!popoverData.value['key'] && !!popoverData.value['type']);

const onSubmitNewObj = (key: string) => {
  if (!isPopoverDataValid.value) return;
  const newItem = {
    $key: popoverData.value['key'],
    $schema: popoverData.value['type'],
  };
  if (!data.value[key]) data.value[key] = {};
  if (data.value[key].$schemas && Array.isArray(data.value[key].$schemas)) data.value[key].$schemas.push(newItem);
  else data.value[key].$schemas = Array(newItem);
  data.value[key][newItem.$key] = [];
  popoverData.value = {};
}

const onDeleteObj = (key: string, idx: number) => {
  delete data.value[key][data.value[key].$schemas[idx].$key];
  (data.value[key].$schemas as Array<any>).splice(idx, 1);
}

/**
 * Human-readable scalar default, if the field declares one. RenderCV leaves
 * most optional fields `null`, so only genuinely-defaulted fields produce a hint.
 */
const defaultValueOf = (prop: any): string | undefined => {
  const value = (prop as any)?.default;
  if (typeof value === 'string') return value === '' ? '""' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
};

const booleanDefaultLabel = (prop: any) => ((prop as any)?.default ? 'on' : 'off');

/** Title plus the default value, so config fields read clearly while empty. */
const propPlaceholder = (key: string, prop: any) => {
  const title = getPropTitle(prop, key);
  const fallback = defaultValueOf(prop);
  return fallback === undefined ? title : `${title} (default: ${fallback})`;
};

/** Stable path of a nested group, used as its collapse key. */
const subPath = (key: string, id: string | number) => `${path}.${key}[${id}]`;
const groupPath = (key: string) => (path ? `${path}.${key}` : key);

/* Header + collapse state ------------------------------------------------ */

const isItem = computed(() => variant === 'item');
const isRoot = computed(() => root === true);

const hasHeader = computed(() => !!(title || userDefKey));
const headerTitle = computed(() => getPropTitle({}, title || userDefKey || 'entry'));

const collapseKey = computed(() => path || 'root');
/**
 * Writable collapse state for this group. It reads the shared store straight
 * off the form controller instead of `useCollapsible()`: a component cannot
 * `inject()` what it `provide()`d itself, so a self-contained (lone) renderer
 * must not go through provide/inject for its own state.
 */
const open = computed({
  get: () => form.collapsible.isOpen(collapseKey.value),
  set: (value: boolean) => form.collapsible.setOpen(collapseKey.value, value),
});

/** Collapse state for an array-level group (single heading for all items). */
const collapseStore = form.collapsible;
const groupKey = (key: string) => `${path}.${key}`;
const groupOpen = (key: string) => collapseStore.isOpen(groupKey(key));
const setGroupOpen = (key: string, open: boolean) => collapseStore.setOpen(groupKey(key), open);

/** Items are always expanded — their group owns the collapse behaviour. */
const onOpenChange = (value: boolean) => {
  if (!isItem.value) open.value = value;
};

/* Field rendering hints -------------------------------------------------- */

const propIsMultiline = (key: string, prop: any) => isMultiline(key, (prop as any)?.title);
const selfMultiline = computed(() => isMultiline(userDefKey, title));

/* Optional-field disclosure ---------------------------------------------- */

const coreList = computed(() => coreFields ?? []);
const isCore = (key: string) => coreList.value.includes(key);

/** A field counts as "filled" once it holds a non-empty value of any kind. */
const hasValue = (key: string | undefined): boolean => !!key && isFilled(data.value?.[key]);

const revealKey = (key: string) => `${path}.${key}`;
const isRevealed = (key: string) => visibility.isRevealed(revealKey(key));
const reveal = (key: string) => visibility.setRevealed(revealKey(key), true);

/* Exclusive (choose-one) groups such as Date: date XOR start/end. --------- */

const exclusiveGroups = computed(() => findExclusiveGroups(currentSchema.value));

const groupStoreKey = (group: ExclusiveGroup) => `${path}.${group.label.toLowerCase()}`;
const groupHasValue = (group: ExclusiveGroup) => [...group.single, ...group.range].some(hasValue);
const groupRevealed = (group: ExclusiveGroup) => visibility.isRevealed(groupStoreKey(group));
const groupVisible = (group: ExclusiveGroup) => groupHasValue(group) || groupRevealed(group);
const revealGroup = (group: ExclusiveGroup) => visibility.setRevealed(groupStoreKey(group), true);

const groupMode = (group: ExclusiveGroup): ExclusiveMode => {
  if (group.single.some(hasValue)) return 'single';
  if (group.range.some(hasValue)) return 'range';
  return visibility.getMode(groupStoreKey(group)) ?? group.defaultMode;
};

const setGroupMode = (group: ExclusiveGroup, mode: ExclusiveMode) => {
  // Clear the other representation so we can never emit both.
  if (mode === 'single') group.range.forEach((key) => { data.value[key] = undefined; });
  else group.single.forEach((key) => { data.value[key] = undefined; });
  visibility.setRevealed(groupStoreKey(group), true);
  visibility.setMode(groupStoreKey(group), mode);
};

const removeGroup = (group: ExclusiveGroup) => {
  [...group.single, ...group.range].forEach((key) => { data.value[key] = undefined; });
  visibility.setRevealed(groupStoreKey(group), false);
};

const exclusiveGroupOf = (key: string) =>
  exclusiveGroups.value.find((group) => group.single.includes(key) || group.range.includes(key));
const isExclusiveMember = (key: string) => !!exclusiveGroupOf(key);
const isExclusiveActive = (key: string) => {
  const group = exclusiveGroupOf(key);
  if (!group) return false;
  // A member only renders while its group is actually shown.
  if (!groupVisible(group)) return false;
  const active = groupMode(group) === 'single' ? group.single : group.range;
  return active.includes(key);
};

const isRequiredProp = (key: string) =>
  Array.isArray(currentSchema.value?.required) && currentSchema.value.required.includes(key);

/**
 * A field is shown when it is required, not optional at all, already filled,
 * part of the core set, or explicitly added by the user.
 */
const isVisible = (prop: any, key: string) => {
  if (isExclusiveMember(key)) return isExclusiveActive(key);
  return isRequiredProp(key) || !isOptional(prop) || hasValue(key) || isCore(key) || isRevealed(key);
};

/**
 * Structured objects are only usable once they exist, so materialise the ones
 * that are visible. Empty objects are dropped on export by `cleanData`, so this
 * never adds noise to the generated YAML.
 */
watchEffect(() => {
  const s = currentSchema.value;
  if (s?.type !== 'object' || !s.properties || !data.value || typeof data.value !== 'object') return;
  for (const [key, prop] of Object.entries(s.properties as Record<string, any>)) {
    if (isPlainObject(prop) && data.value[key] === undefined && isVisible(prop, key)) {
      data.value[key] = {};
    }
  }
});

/* Properties ------------------------------------------------------------- */

const properties = computed<Array<[string, any]>>(() => {
  const s = currentSchema.value;
  if (s?.type !== 'object' || !s.properties) return [];
  const entries = Object.entries(s.properties as Record<string, any>);
  // The discriminator is edited through its own Select, never as a plain field.
  const discriminator = union.value?.propertyName;
  return discriminator ? entries.filter(([key]) => key !== discriminator) : entries;
});

const visibleProperties = computed(() => properties.value.filter(([key, prop]) => isVisible(prop, key)));

const hasSectionsKey = computed(() => properties.value.some(([key]) => key === 'sections'));

/** Optional fields not shown yet — offered via "Add" chips / menu. */
const hiddenProperties = computed(() =>
  properties.value.filter(([key, prop]) => !isVisible(prop, key) && !isExclusiveMember(key)),
);
const hiddenGroups = computed(() => exclusiveGroups.value.filter((group) => !groupVisible(group)));
const hasHiddenFields = computed(() => hiddenProperties.value.length > 0 || hiddenGroups.value.length > 0);

/** Optional fields can be deleted again (required / core fields cannot). */
const isRemovable = (prop: any, key: string) =>
  isOptional(prop) && !isRequiredProp(key) && !isCore(key) && !isExclusiveMember(key);

const removeField = (key: string) => {
  data.value[key] = undefined;
  visibility.setRevealed(revealKey(key), false);
};

/* Discriminator switching ------------------------------------------------ */

const confirmUnionOpen = ref(false);
const pendingUnionKey = ref<string | null>(null);

/** True once the user has set anything besides the discriminator. */
const unionCustomized = computed(() => {
  const u = union.value;
  if (!u) return false;
  return Object.keys(data.value ?? {}).some((key) => key !== u.propertyName && hasValue(key));
});

const unionConfirmTitle = computed(() => {
  const name = union.value?.propertyName;
  return name === 'language' ? 'Switch language?' : name === 'theme' ? 'Switch theme?' : 'Switch variant?';
});
const unionConfirmDescription = computed(() => {
  const name = union.value?.propertyName === 'language' ? 'language' : 'theme';
  return `Switching ${name} resets the customizations you made here. Export first if you want to keep them.`;
});

const applyUnionKey = (key: string) => {
  const u = union.value;
  if (!u || data.value?.[u.propertyName] === key) return;
  // Reset to just the discriminator: the previous variant's values were tuned
  // for the previous theme/locale and should not carry over.
  data.value = { [u.propertyName]: key };
};

const onUnionChange = (value: unknown) => {
  if (typeof value !== 'string' || !union.value || value === unionKey.value) return;
  if (unionCustomized.value) {
    pendingUnionKey.value = value;
    confirmUnionOpen.value = true;
    return;
  }
  applyUnionKey(value);
};

const confirmUnionSwitch = () => {
  if (pendingUnionKey.value) applyUnionKey(pendingUnionKey.value);
  pendingUnionKey.value = null;
};

/* Required-field validation ---------------------------------------------- */

const touched = reactive(new Set<string>());
const markTouched = (key: string) => touched.add(key);

const isInvalid = (key: string) =>
  isRequiredProp(key) && isBlank(data.value[key]) && (touched.has(key) || validation.requested.value);

const fieldId = (key: string) => `${collapseKey.value}.${key}`;

// Keep the shared registry in sync with the fields owned by this group.
watchEffect(() => {
  const s = currentSchema.value;
  if (s?.type !== 'object' || !s.properties) return;
  for (const key of Object.keys(s.properties as Record<string, any>)) {
    if (isInvalid(key)) validation.invalid.add(fieldId(key));
    else validation.invalid.delete(fieldId(key));
  }
});

onScopeDispose(() => {
  const s = currentSchema.value;
  if (s?.type !== 'object' || !s.properties) return;
  for (const key of Object.keys(s.properties as Record<string, any>)) {
    validation.invalid.delete(fieldId(key));
  }
});

/** The Date control sits above its first active member (Date or Start Date). */
const groupHeaderFor = computed<Record<string, ExclusiveGroup>>(() => {
  const headers: Record<string, ExclusiveGroup> = {};
  const props = currentSchema.value?.properties as Record<string, any> | undefined;
  for (const group of exclusiveGroups.value) {
    if (!groupVisible(group)) continue;
    const active = groupMode(group) === 'single' ? group.single : group.range;
    const first = active.find((key) => isVisible(props?.[key] ?? {}, key));
    if (first) headers[first] = group;
  }
  return headers;
});

/* Public control surface -------------------------------------------------- */

/**
 * Imperative controls exposed on the component instance (template `ref`):
 *  - `validate()` — reveal errors, resolve `true` when the form is valid
 *  - `expandAll()` / `collapseAll()`
 *  - `reset()` — reset disclosure + validation UI state (does not touch your data)
 *  - `output` — the cleaned value (internal `$schemas` markers removed)
 *
 * These operate on the shared form state, so calling them on any renderer
 * affects every renderer that shares the same state.
 */
defineExpose({
  validate: form.validate,
  expandAll: form.expandAll,
  collapseAll: form.collapseAll,
  reset: form.reset,
  output: computed(() => cleanData(data.value)),
});
</script>

<template>
  <FieldSet :class="cn(isItem ? 'border-0 p-0 gap-2' : 'border border-border rounded-md p-2 gap-2', ui?.root)">
    <!--
      reka-ui's tooltips require a `TooltipProvider` ancestor. Rendering one here
      (it renders no DOM of its own) keeps the renderer self-contained: no app
      level provider is needed, and an SSR shell won't throw for a missing one.
    -->
    <TooltipProvider>
    <Collapsible :open="isItem || open" @update:open="onOpenChange" class="flex flex-col gap-2">
      <div v-if="!isItem && (hasHeader || onDelete)" class="flex flex-row items-center justify-between gap-2"
        :class="ui?.header">
        <CollapsibleTrigger v-if="hasHeader" as-child>
          <Button variant="ghost" size="sm" class="min-w-0 flex-1 justify-start font-medium">
            <ChevronRightIcon class="shrink-0 transition-transform duration-200 ease-out"
              :class="open ? 'rotate-90' : ''" />
            <span class="truncate">{{ headerTitle }}</span>
          </Button>
        </CollapsibleTrigger>
        <span v-else class="flex-1" />

        <ConfirmDialog v-if="onDelete" :title="`Remove ${title || 'entry'}?`"
          :description="`This deletes the ${(title || 'entry').toLowerCase()} and everything inside it from the form.`"
          confirm-label="Remove" @confirm="onDelete && onDelete()">
          <template #trigger>
            <Button size="xs" variant="secondary">
              <MinusIcon />
              Remove {{ title || 'Entry' }}
            </Button>
          </template>
        </ConfirmDialog>
      </div>

      <CollapsibleContent>
        <div class="flex flex-col gap-2" :class="ui?.content">
          <!-- Discriminated union selector (theme / language). -->
          <div v-if="union" class="flex flex-col gap-1">
            <FieldLabel>{{ getPropTitle({}, union.propertyName) }}</FieldLabel>
            <Select :model-value="unionKey ?? union.options[0].key" @update:model-value="onUnionChange">
              <SelectTrigger>
                <SelectValue :placeholder="getPropTitle({}, union.propertyName)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in union.options" :key="option.key" :value="option.key">
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <template v-if="currentSchema.type === 'object'">
            <template v-for="([key, prop]) in visibleProperties" :key="key">
              <!-- Root optionals sit above Sections so a long import can't bury them. -->
              <div v-if="isRoot && key === 'sections' && hasHiddenFields" class="flex flex-wrap gap-1"
                :class="ui?.chips">
                <Button v-for="group in hiddenGroups" :key="group.label" type="button" size="xs" variant="outline"
                  class="text-muted-foreground" @click="() => revealGroup(group)">
                  <PlusIcon />
                  {{ group.label }}
                </Button>
                <Button v-for="([hiddenKey, hiddenProp]) in hiddenProperties" :key="hiddenKey" type="button" size="xs"
                  variant="outline" class="text-muted-foreground" @click="() => reveal(hiddenKey)">
                  <PlusIcon />
                  {{ getPropTitle(hiddenProp, hiddenKey) }}
                </Button>
              </div>

              <Field :data-invalid="isInvalid(key)">
                <!-- section maps (free-form keys, each matching one of several schemas) -->
                <template v-if="hasSectionOptions(prop)">
                  <template v-if="data[key] && data[key].$schemas" v-for="(item, idx) in (data[key].$schemas as Array<any>)">
                    <FormRenderer :schema="item.$schema" v-model="data[key][item.$key]" :path="subPath(key, item.$key)"
                      :onDelete="() => onDeleteObj(key, idx)" :userDefKey="item.$key"
                      :title="`${toTitleCase(item.$key)} Section`" />
                  </template>

                  <Popover>
                    <PopoverTrigger as-child>
                      <Button variant="outline" class="max-w-fit self-start">
                        <PlusIcon />
                        Add {{ removeTrailingS(getPropTitle(prop, key)) }}
                      </Button>
                    </PopoverTrigger>

                    <PopoverContent class="w-100">
                      <FieldLabel class="mb-2" v-if="(prop as any).description">
                        {{ (prop as any).description }}
                      </FieldLabel>
                      <div class="flex gap-2">
                        <Input type="text" v-model="popoverData['key']"
                          :placeholder="`${removeTrailingS(getPropTitle(prop, key))} Key`" />
                        <Select v-model="popoverData['type']">
                          <SelectTrigger>
                            <SelectValue :placeholder="`${removeTrailingS(getPropTitle(prop, key))} Type`" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem v-for="opt in getObjectOptions(prop) ?? []" :value="opt">
                              {{ opt.items.title || "General" }}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <PopoverClose as-child>
                          <Button :disabled="!isPopoverDataValid" @click="() => onSubmitNewObj(key)">
                            <CheckIcon />
                          </Button>
                        </PopoverClose>
                      </div>
                    </PopoverContent>
                  </Popover>
                </template>

                <!-- structured objects (theme sections, page, colors, settings…) -->
                <template v-else-if="isPlainObject(prop)">
                  <FormRenderer :schema="prop" v-model="data[key]" :path="groupPath(key)"
                    :title="getPropTitle(prop, key)" />
                </template>

                <template v-else-if="hasType(prop, 'array')">
                  <!-- scalar arrays: one group heading, compact rows -->
                  <Collapsible v-if="isPrimitiveArray(prop)" :open="groupOpen(key)"
                    @update:open="(value) => setGroupOpen(key, value)" class="flex flex-col gap-2">
                    <div class="flex flex-row items-center justify-between gap-2">
                      <CollapsibleTrigger as-child>
                        <Button variant="ghost" size="sm" class="min-w-0 flex-1 justify-start font-medium">
                          <ChevronRightIcon class="shrink-0 transition-transform duration-200 ease-out"
                            :class="groupOpen(key) ? 'rotate-90' : ''" />
                          <span class="truncate">{{ getPropTitle(prop, key) }}</span>
                        </Button>
                      </CollapsibleTrigger>
                      <Button v-if="isRemovable(prop, key)" type="button" size="icon-xs" variant="ghost"
                        class="shrink-0 text-muted-foreground hover:text-destructive"
                        :aria-label="`Remove ${getPropTitle(prop, key)}`" @click="() => removeField(key)">
                        <XIcon />
                      </Button>
                    </div>

                    <CollapsibleContent>
                      <div class="flex flex-col gap-2">
                        <div v-for="(_item, idx) in (data[key] as Array<any>)" :key="idx" class="flex items-start gap-2">
                          <FormRenderer variant="item" :schema="getArrayItems(prop)" v-model="data[key][idx]"
                            :path="subPath(key, idx)" :title="`${removeTrailingS(getPropTitle(prop, key))}`"
                            class="min-w-0 flex-1" />
                          <Button type="button" size="icon-xs" variant="ghost" class="mt-0.5 shrink-0"
                            :aria-label="`Remove ${removeTrailingS(getPropTitle(prop, key))}`"
                            @click="() => (data[key] as Array<any>).splice(idx, 1)">
                            <XIcon />
                          </Button>
                        </div>

                        <Tooltip>
                          <TooltipTrigger as-child>
                            <Button variant="outline" class="max-w-fit self-start"
                              @click="() => addArrayItem(prop, key)">
                              <PlusIcon />
                              Add {{ removeTrailingS(getPropTitle(prop, key)) }}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent v-if="(prop as any).description" class="flex flex-col max-w-[450px]">
                            {{ (prop as any).description }}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <!-- object arrays: keep the per-entry collapsible group -->
                  <template v-else>
                    <div v-if="isRemovable(prop, key)" class="flex flex-row items-center justify-between gap-2">
                      <span class="text-xs font-medium">{{ getPropTitle(prop, key) }}</span>
                      <Button type="button" size="icon-xs" variant="ghost"
                        class="shrink-0 text-muted-foreground hover:text-destructive"
                        :aria-label="`Remove ${getPropTitle(prop, key)}`" @click="() => removeField(key)">
                        <XIcon />
                      </Button>
                    </div>

                    <template v-for="(_item, idx) in (data[key] as Array<any>)">
                      <FormRenderer :schema="getArrayItems(prop)" v-model="data[key][idx]" :path="subPath(key, idx)"
                        :onDelete="() => (data[key] as Array<any>).splice(idx, 1)"
                        :title="`${removeTrailingS(getPropTitle(prop, key))}`" />
                    </template>

                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button variant="outline" class="max-w-fit self-start"
                          @click="() => addArrayItem(prop, key)">
                          <PlusIcon />
                          Add {{ removeTrailingS(getPropTitle(prop, key)) }}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent v-if="(prop as any).description" class="flex flex-col max-w-[450px]">
                        {{ (prop as any).description }}
                      </TooltipContent>
                    </Tooltip>
                  </template>
                </template>

                <!-- booleans (e.g. dont_generate_pdf, show_footer) -->
                <template v-else-if="isBooleanProp(prop)">
                  <div class="flex flex-row items-center justify-between gap-2">
                    <FieldLabel>
                      {{ getPropTitle(prop, key) }}
                      <span v-if="defaultValueOf(prop) !== undefined" class="text-muted-foreground font-normal">
                        (default: {{ booleanDefaultLabel(prop) }})
                      </span>
                    </FieldLabel>
                    <div class="flex flex-row items-center gap-1">
                      <Switch v-model="data[key]" />
                      <InputGroupButton v-if="isRemovable(prop, key)" size="icon-xs" variant="ghost"
                        class="text-muted-foreground hover:text-destructive"
                        :aria-label="`Remove ${getPropTitle(prop, key)}`" @click="() => removeField(key)">
                        <XIcon />
                      </InputGroupButton>
                    </div>
                  </div>
                  <FieldError v-if="isInvalid(key)">This field is required.</FieldError>
                </template>

                <template v-else-if="scalarEnumOf(prop)">
                  <Select v-model="data[key]">
                    <SelectTrigger :aria-invalid="isInvalid(key)" :class="isInvalid(key) && 'border-destructive'"
                      @blur="markTouched(key)">
                      <SelectValue :placeholder="`${propPlaceholder(key, prop)}${isRequiredProp(key) ? ' *' : ''}`" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="opt in scalarEnumOf(prop) ?? []" :value="opt">{{ opt }}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError v-if="isInvalid(key)">This field is required.</FieldError>
                </template>

                <template v-else>
                  <!-- the Date control sits above its first active member -->
                  <div v-if="groupHeaderFor[key]" class="flex flex-row items-center justify-between gap-2">
                    <FieldLabel>{{ groupHeaderFor[key].label }}</FieldLabel>
                    <div class="flex flex-row items-center gap-1">
                      <ButtonGroup>
                        <Button type="button" size="xs"
                          :variant="groupMode(groupHeaderFor[key]) === 'range' ? 'secondary' : 'ghost'"
                          @click="() => setGroupMode(groupHeaderFor[key], 'range')">
                          Range
                        </Button>
                        <Button type="button" size="xs"
                          :variant="groupMode(groupHeaderFor[key]) === 'single' ? 'secondary' : 'ghost'"
                          @click="() => setGroupMode(groupHeaderFor[key], 'single')">
                          Single date
                        </Button>
                      </ButtonGroup>
                      <Button type="button" size="icon-xs" variant="ghost" class="text-muted-foreground"
                        :aria-label="`Remove ${groupHeaderFor[key].label}`"
                        @click="() => removeGroup(groupHeaderFor[key])">
                        <XIcon />
                      </Button>
                    </div>
                  </div>

                  <InputGroup>
                    <InputGroupAddon v-if="isRequiredProp(key)" align="inline-start"
                      :class="propIsMultiline(key, prop) && 'self-start'" class="text-destructive">
                      <span aria-hidden="true">*</span>
                      <span class="sr-only">required</span>
                    </InputGroupAddon>

                    <InputGroupTextarea v-if="propIsMultiline(key, prop)" v-model="data[key]"
                      :required="isRequiredProp(key)" :aria-invalid="isInvalid(key)"
                      :placeholder="propPlaceholder(key, prop)" class="min-h-8 py-1.5" @blur="markTouched(key)" />
                    <InputGroupInput v-else type="text" v-model="data[key]" :required="isRequiredProp(key)"
                      :aria-invalid="isInvalid(key)" :placeholder="propPlaceholder(key, prop)" @blur="markTouched(key)" />

                    <InputGroupAddon
                      v-if="(prop as any).description || (prop as any).examples || isRemovable(prop, key)"
                      align="inline-end" :class="propIsMultiline(key, prop) && 'self-start'">
                      <Tooltip v-if="(prop as any).description || (prop as any).examples">
                        <TooltipTrigger as-child>
                          <InfoIcon />
                        </TooltipTrigger>
                        <TooltipContent v-if="(prop as any).examples && Array.isArray((prop as any).examples)"
                          class="flex flex-col max-w-[450px]">
                          <span v-if="(prop as any).description">{{ (prop as any).description }}</span>
                          <span class="font-bold">Examples:</span>
                          <span v-html="((prop as any).examples as Array<string>)
                            .reduce((acc, ex) => acc ? `${acc}<br>${ex}` : ex, '')"></span>
                        </TooltipContent>
                      </Tooltip>
                      <InputGroupButton v-if="isRemovable(prop, key)" size="icon-xs" variant="ghost"
                        class="text-muted-foreground hover:text-destructive"
                        :aria-label="`Remove ${getPropTitle(prop, key)}`" @click="() => removeField(key)">
                        <XIcon />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldError v-if="isInvalid(key)">This field is required.</FieldError>
                </template>
              </Field>
            </template>

            <!-- Entry optionals are offered at the end of the group. -->
            <div v-if="hasHiddenFields && (!isRoot || !hasSectionsKey)" class="flex flex-wrap gap-1"
              :class="ui?.chips">
              <Button v-for="group in hiddenGroups" :key="group.label" type="button" size="xs" variant="outline"
                class="text-muted-foreground" @click="() => revealGroup(group)">
                <PlusIcon />
                {{ group.label }}
              </Button>
              <Button v-for="([key, prop]) in hiddenProperties" :key="key" type="button" size="xs" variant="outline"
                class="text-muted-foreground" @click="() => reveal(key)">
                <PlusIcon />
                {{ getPropTitle(prop, key) }}
              </Button>
            </div>
          </template>

          <template v-else-if="currentSchema.type === 'array'">
            <template v-for="(_item, idx) in (data as Array<any>)">
              <FormRenderer :schema="currentSchema.items as any" v-model="data[idx]" :path="`${path}[${idx}]`"
                :onDelete="() => (data as Array<any>).splice(idx, 1)"
                :title="removeTrailingS(getPropTitle({}, userDefKey || 'entry'))" />
            </template>

            <Button variant="outline" class="max-w-fit self-start"
              @click="data.push((currentSchema.items as any).type === 'object' ? {} : '')">
              <PlusIcon />
              Add {{ removeTrailingS(getPropTitle({}, userDefKey || "entry")) }}
            </Button>
          </template>

          <template v-else-if="currentSchema.type === 'string'">
            <Field>
              <Textarea v-if="selfMultiline" v-model="data"
                :placeholder="getPropTitle({}, title || userDefKey || 'entry')" class="min-h-8 resize-none py-1.5" />
              <Input v-else type="text" v-model="data"
                :placeholder="getPropTitle({}, title || userDefKey || 'entry')" />
            </Field>
          </template>
        </div>
      </CollapsibleContent>
    </Collapsible>

    <!-- Confirmation shown only when switching would discard customizations. -->
    <ConfirmDialog v-model:open="confirmUnionOpen" :title="unionConfirmTitle"
      :description="unionConfirmDescription" cancel-label="Keep editing" confirm-label="Discard & switch"
      @confirm="confirmUnionSwitch">
      <template #trigger>
        <span class="hidden" aria-hidden="true" />
      </template>
    </ConfirmDialog>
    </TooltipProvider>
  </FieldSet>
</template>
