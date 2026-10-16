<script setup lang="ts">
import type { JSONSchema } from '@apidevtools/json-schema-ref-parser';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Field, FieldError, FieldLabel, FieldSet } from './ui/field';
import { Button } from './ui/button';
import { CheckIcon, ChevronRightIcon, InfoIcon, MinusIcon, PlusIcon, XIcon } from '@lucide/vue';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { PopoverClose } from 'reka-ui';
import { computed, onScopeDispose, reactive, ref, watchEffect } from 'vue';
import { removeTrailingS, toTitleCase } from '@/lib/utils';
import { isMultiline } from '@/lib/fieldHints';
import { CORE_FIELDS, findExclusiveGroups, isOptional, type ExclusiveGroup, type FieldScope } from '@/lib/fieldPolicy';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupTextarea } from './ui/input-group';
import { ButtonGroup } from './ui/button-group';
import ConfirmDialog from './ConfirmDialog.vue';
import { useCollapsible, useCollapsibleStore } from '@/composables/useCollapsibleState';
import { useValidationState } from '@/composables/useValidationState';
import { useFieldVisibility, type ExclusiveMode } from '@/composables/useFieldVisibility';

const data = defineModel<any>({ required: true });

let { schema, onDelete, userDefKey, title, path = '', variant = 'group' } = defineProps<{
  schema: JSONSchema,
  onDelete?: Function,
  userDefKey?: string,
  title?: string,
  /** Stable location of this group in the form, used to persist its collapse state. */
  path?: string,
  /** 'item' renders the fields inline (no header) — used for entries inside an array group. */
  variant?: 'group' | 'item',
}>();

const validation = useValidationState();
const visibility = useFieldVisibility();

const isRequiredProp = (key: any) => Array.isArray(schema.required) && schema.required.includes(key);

const getPropTitle = (prop: any, key: string) => prop.title as string ||
  key.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');

const hasType = (prop: any, type: string) => prop.anyOf && Array.isArray(prop.anyOf)
  && (prop.anyOf as Array<any>).reduce((acc, d) => acc || d.type === type, false);

const getArrayItems = (prop: any) => prop.anyOf && Array.isArray(prop.anyOf)
  && (prop.anyOf as Array<any>).reduce((acc, d) => {
    if (!acc && d.type === "array") return d.items;
    return acc;
  }, null);

/** Arrays of scalars (e.g. `highlights`) get one shared group; object arrays keep per-entry groups. */
const isPrimitiveArray = (prop: any) => {
  const items = getArrayItems(prop);
  return !!items && items.type !== 'object';
};

const addArrayItem = (prop: any, key: string) => {
  const newItem = getArrayItems(prop).type === "object" ? {} : "";
  if (data.value[key] && Array.isArray(data.value[key])) data.value[key].push(newItem);
  else data.value[key] = Array(newItem);
}

const getObjectOptions = (prop: any) => {
  if (!(prop.anyOf && Array.isArray(prop.anyOf))) return [];
  return (prop.anyOf as Array<any>).reduce((acc, d) => {
    if (!acc && d.type === "object") return d.additionalProperties.anyOf;
    return acc;
  }, null) as Array<any>;
}

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

/** Header + collapse state ---------------------------------------------- */

const isItem = computed(() => variant === 'item');

const hasHeader = computed(() => !!(title || userDefKey));
const headerTitle = computed(() => getPropTitle({}, title || userDefKey || 'entry'));

const collapseKey = computed(() => path || 'root');
const open = useCollapsible(() => collapseKey.value);

/** Collapse state for an array-level group (single heading for all items). */
const collapseStore = useCollapsibleStore();
const groupKey = (key: string) => `${path}.${key}`;
const groupOpen = (key: string) => collapseStore.isOpen(groupKey(key));
const setGroupOpen = (key: string, open: boolean) => collapseStore.setOpen(groupKey(key), open);

/** Items are always expanded — their group owns the collapse behaviour. */
const onOpenChange = (value: boolean) => {
  if (!isItem.value) open.value = value;
};

/** Stable path of a nested group, used as its collapse key. */
const subPath = (key: string, id: string | number) => `${path}.${key}[${id}]`;

/** Field rendering hints ------------------------------------------------ */

const propIsMultiline = (key: string, prop: any) => isMultiline(key, (prop as any)?.title);
const selfMultiline = computed(() => isMultiline(userDefKey, title));

/** Required-field validation ------------------------------------------- */

const touched = reactive(new Set<string>());
const markTouched = (key: string) => touched.add(key);

const isEmpty = (value: any) => value === undefined || value === null || value === '';

const isInvalid = (key: string) =>
  isRequiredProp(key) && isEmpty(data.value[key]) && (touched.has(key) || validation.requested.value);

const fieldId = (key: string) => `${collapseKey.value}.${key}`;

// Keep the shared registry in sync with the fields owned by this group.
watchEffect(() => {
  if (schema.type !== 'object' || !schema.properties) return;
  for (const key of Object.keys(schema.properties as Record<string, any>)) {
    if (isInvalid(key)) validation.invalid.add(fieldId(key));
    else validation.invalid.delete(fieldId(key));
  }
});

onScopeDispose(() => {
  if (schema.type !== 'object' || !schema.properties) return;
  for (const key of Object.keys(schema.properties as Record<string, any>)) {
    validation.invalid.delete(fieldId(key));
  }
});

/** Optional-field disclosure -------------------------------------------- */

const isRoot = computed(() => path === '');
const fieldScope = computed<FieldScope>(() => (isRoot.value ? 'root' : 'entry'));
const isCore = (key: string) => CORE_FIELDS[fieldScope.value].includes(key);

/** A field counts as "filled" once it holds a non-empty value of any kind. */
const hasValue = (key: string | undefined): boolean => {
  if (!key) return false;
  const value = data.value?.[key];
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false;
  return true;
};

const revealKey = (key: string) => `${path}.${key}`;
const isRevealed = (key: string) => visibility.isRevealed(revealKey(key));
const reveal = (key: string) => visibility.setRevealed(revealKey(key), true);

/** Exclusive (choose-one) groups such as Date: date XOR start/end. */
const exclusiveGroups = computed(() => findExclusiveGroups(schema));

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

/**
 * A field is shown when it is required, not optional at all, already filled,
 * part of the core set, or explicitly added by the user.
 */
const isVisible = (prop: any, key: string) => {
  if (isExclusiveMember(key)) return isExclusiveActive(key);
  return isRequiredProp(key) || !isOptional(prop) || hasValue(key) || isCore(key) || isRevealed(key);
};

const properties = computed<Array<[string, any]>>(() =>
  schema.type === 'object' && schema.properties
    ? Object.entries(schema.properties as Record<string, any>)
    : [],
);

const visibleProperties = computed(() => properties.value.filter(([key, prop]) => isVisible(prop, key)));

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

/** The Date control sits above its first active member (Date or Start Date). */
const groupHeaderFor = computed<Record<string, ExclusiveGroup>>(() => {
  const headers: Record<string, ExclusiveGroup> = {};
  for (const group of exclusiveGroups.value) {
    if (!groupVisible(group)) continue;
    const active = groupMode(group) === 'single' ? group.single : group.range;
    const first = active.find((key) => isVisible((schema.properties as any)?.[key] ?? {}, key));
    if (first) headers[first] = group;
  }
  return headers;
});
</script>

<template>
  <FieldSet :class="isItem ? 'border-0 p-0 gap-2' : 'border p-2 gap-2'">
    <Collapsible :open="isItem || open" @update:open="onOpenChange" class="flex flex-col gap-2">
      <div v-if="!isItem && (hasHeader || onDelete)" class="flex flex-row items-center justify-between gap-2">
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
        <div class="flex flex-col gap-2">
          <template v-if="schema.type === 'object'">
            <template v-for="([key, prop]) in visibleProperties" :key="key">
              <!-- Root optionals sit above Sections so a long import can't bury them. -->
              <div v-if="isRoot && key === 'sections' && hasHiddenFields" class="flex flex-wrap gap-1">
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
                <template v-if="hasType(prop, 'object')">
                  <template v-if="data[key] && data[key].$schemas" v-for="(item, idx) in (data[key].$schemas as Array<any>)">
                    <FormRenderer :schema="item.$schema" v-model="data[key][item.$key]" :path="subPath(key, item.$key)"
                      :onDelete="() => onDeleteObj(key, idx)" :userDefKey="item.$key"
                      :title="`${toTitleCase(item.$key)} Section`" />
                  </template>

                  <Popover>
                    <PopoverTrigger as-child>
                      <Button>
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
                            <SelectItem v-for="opt in getObjectOptions(prop)" :value="opt">
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
                            <Button @click="() => addArrayItem(prop, key)">
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
                        <Button @click="() => addArrayItem(prop, key)">
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

                <template v-else-if="(prop as any).enum">
                  <Select v-model="data[key]">
                    <SelectTrigger :aria-invalid="isInvalid(key)" :class="isInvalid(key) && 'border-destructive'"
                      @blur="markTouched(key)">
                      <SelectValue :placeholder="`${getPropTitle(prop, key)}${isRequiredProp(key) ? ' *' : ''}`" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="opt in (prop as any).enum" :value="opt">{{ opt }}</SelectItem>
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
                      :placeholder="getPropTitle(prop, key)" class="min-h-8 py-1.5" @blur="markTouched(key)" />
                    <InputGroupInput v-else type="text" v-model="data[key]" :required="isRequiredProp(key)"
                      :aria-invalid="isInvalid(key)" :placeholder="getPropTitle(prop, key)" @blur="markTouched(key)" />

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
            <div v-if="!isRoot && hasHiddenFields" class="flex flex-wrap gap-1">
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

          <template v-else-if="schema.type === 'array'">
            <template v-for="(_item, idx) in (data as Array<any>)">
              <FormRenderer :schema="schema.items as any" v-model="data[idx]" :path="`${path}[${idx}]`"
                :onDelete="() => (data as Array<any>).splice(idx, 1)"
                :title="removeTrailingS(getPropTitle({}, userDefKey || 'entry'))" />
            </template>

            <Button @click="data.push((schema.items as any).type === 'object' ? {} : '')">
              <PlusIcon />
              Add {{ removeTrailingS(getPropTitle({}, userDefKey || "entry")) }}
            </Button>
          </template>

          <template v-else-if="schema.type === 'string'">
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
  </FieldSet>
</template>
