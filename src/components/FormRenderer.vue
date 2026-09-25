<script setup lang="ts">
import type { JSONSchema } from '@apidevtools/json-schema-ref-parser';
import { Input } from './ui/input';
import { Field, FieldLabel, FieldSet } from './ui/field';
import { Button } from './ui/button';
import { CheckIcon, InfoIcon, MinusIcon, PlusIcon } from '@lucide/vue';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { PopoverClose } from 'reka-ui';
import { computed, ref } from 'vue';
import { removeTrailingS, toTitleCase } from '@/lib/utils';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';

const data = defineModel<any>({ required: true });

let { schema } = defineProps<{
  schema: JSONSchema,
  onDelete?: Function,
  userDefKey?: string,
  title?: string,
}>();

const isRequiredProp = (key: any) => schema.required && Array.isArray(schema.required)
  && schema.required.includes(key);

const getPropTitle = (prop: any, key: string) => prop.title as string ||
  key.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');

const hasType = (prop: any, type: string) => prop.anyOf && Array.isArray(prop.anyOf)
  && (prop.anyOf as Array<any>).reduce((acc, d) => acc || d.type === type, false);

const getArrayItems = (prop: any) => prop.anyOf && Array.isArray(prop.anyOf)
  && (prop.anyOf as Array<any>).reduce((acc, d) => {
    if (!acc && d.type === "array") return d.items;
    return acc;
  }, null);

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
</script>

<template>
  <FieldSet class="border p-2 gap-2">
    <div class="flex flex-row justify-between">
      <FieldLabel v-if="onDelete">
        {{ getPropTitle({}, title || userDefKey || "entry") }}
      </FieldLabel>

      <Button v-if="onDelete" size="xs" variant="secondary" @click="onDelete">
        <MinusIcon />
        Remove {{ title || 'Entry' }}
      </Button>
    </div>

    <Field v-if="schema.type === 'object'" v-for="(prop, key) in schema.properties">
      <template v-if="hasType(prop, 'object')">
        <template v-if="data[key] && data[key].$schemas" v-for="(item, idx) in (data[key].$schemas as Array<any>)">
          <FormRenderer :schema="item.$schema" v-model="data[key][item.$key]" :onDelete="() => onDeleteObj(key, idx)"
            :userDefKey="item.$key" :title="`${toTitleCase(item.$key)} Section`" />
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
        <template v-for="(_item, idx) in (data[key] as Array<any>)">
          <FormRenderer :schema="getArrayItems(prop)" v-model="data[key][idx]"
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

      <template v-else-if="(prop as any).enum">
        <Select v-model="data[key]">
          <SelectTrigger>
            <SelectValue :placeholder="getPropTitle(prop, key)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in (prop as any).enum" :value="opt">{{ opt }}</SelectItem>
          </SelectContent>
        </Select>
      </template>

      <template v-else>
        <InputGroup>
          <InputGroupInput type="text" v-model="data[key]" :required="isRequiredProp(key)"
            :placeholder="getPropTitle(prop, key)" />
          <InputGroupAddon v-if="(prop as any).description || (prop as any).examples" align="inline-end">
            <Tooltip>
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
          </InputGroupAddon>
        </InputGroup>
      </template>
    </Field>

    <template v-else-if="schema.type === 'array'">
      <template v-for="(_item, idx) in (data as Array<any>)">
        <FormRenderer :schema="schema.items as any" v-model="data[idx]"
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
        <Input type="text" v-model="data" :placeholder="getPropTitle({}, title || userDefKey || 'entry')" />
      </Field>
    </template>
  </FieldSet>
</template>