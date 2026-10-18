import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import {
  FormRenderer,
  provideFormState,
  type FormStateController,
  type JsonSchema,
} from '../src/index';

/**
 * Renderer-level behaviour in a DOM: the documented UX (progressive disclosure,
 * exclusive groups, required validation) and field labelling. These run against
 * `src/` and cover the field-policy helpers the renderer shares with
 * `validateDoc()`.
 */

let app: App | undefined;

const mount = (component: any, props: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(component, props);
  app.mount(host);
  return host;
};

/** A reactive model, the way a `v-model` on a ref/reactive object would be. */
const model = <T extends object>(value: T): T => reactive(value) as T;

const render = (schema: JsonSchema, modelValue: any, extra: Record<string, unknown> = {}) => {
  const host = mount({
    setup: () => () => h(FormRenderer as any, { schema, modelValue, ...extra }),
  });
  return host;
};

const placeholders = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('input, textarea')).map((el) => (el as HTMLInputElement).placeholder);

const buttonByText = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.trim().includes(text));

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('field labels', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Name' },
      first_name: { type: 'string' },
      given_name: { type: 'string', title: 'Given name' },
    },
  };

  it('uses the schema title, falling back to the title-cased key', () => {
    const host = render(schema, {}, { coreFields: ['name', 'first_name', 'given_name'] });

    expect(placeholders(host)).toEqual(['Name', 'First Name', 'Given name']);
  });
});

describe('optional-field disclosure', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Name' },
      email: { default: null, title: 'Email' },
    },
  };

  it('hides a nullable field behind an "add" chip until it is added', async () => {
    const host = render(schema, { name: 'Jane' }, { coreFields: ['name'] });

    expect(placeholders(host)).toEqual(['Name']);

    buttonByText(host, 'Email')!.click();
    await nextTick();

    expect(placeholders(host)).toEqual(['Name', 'Email']);
  });

  it('shows an optional field straight away when it already holds a value', () => {
    const host = render(schema, { name: 'Jane', email: 'jane@example.com' }, { coreFields: ['name'] });
    expect(placeholders(host)).toEqual(['Name', 'Email']);
  });
});

describe('field kinds', () => {
  it('renders multi-line fields as a textarea', () => {
    const schema: JsonSchema = { type: 'object', properties: { summary: { type: 'string' } } };
    const host = render(schema, {}, { coreFields: ['summary'] });

    expect(host.querySelector('textarea')).not.toBeNull();
    expect(host.querySelector('input')).toBeNull();
  });

  it('toggles a boolean in place through the switch', async () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { show_footer: { type: 'boolean', title: 'Show Footer' } },
    };
    const doc: any = model({});
    const host = render(schema, doc, { coreFields: ['show_footer'] });

    (host.querySelector('[role="switch"]') as HTMLElement).click();
    await nextTick();

    expect(doc.show_footer).toBe(true);
  });
});

describe('required-field validation', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', title: 'Name' },
      email: { default: null, title: 'Email' },
    },
  };

  it('reveals the error on validate() and clears once the field is filled', async () => {
    const doc: any = model({});
    const renderer: { value: any } = { value: null };
    const host = mount({
      setup: () => () =>
        h(FormRenderer as any, {
          ref: (instance: any) => { renderer.value = instance; },
          schema,
          modelValue: doc,
          title: 'Person',
          coreFields: ['name'],
          persist: false,
        }),
    });

    await nextTick();
    expect(host.textContent).not.toContain('This field is required.');

    await expect(renderer.value.validate()).resolves.toBe(false);
    await nextTick();
    expect(host.textContent).toContain('This field is required.');

    doc.name = 'Jane';
    await nextTick();
    await expect(renderer.value.validate()).resolves.toBe(true);
    expect(host.textContent).not.toContain('This field is required.');
  });
});

describe('exclusive (choose-one) groups', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      date: { type: 'string' },
      start_date: { type: 'string' },
      end_date: { type: 'string' },
    },
  };

  it('shows the range representation and switches to a single date without keeping both', async () => {
    const doc: any = model({ start_date: '2020-01', end_date: '2020-02' });
    const host = render(schema, doc);

    expect(host.textContent).toContain('Date');
    expect(placeholders(host)).toEqual(['Start Date', 'End Date']);

    buttonByText(host, 'Single date')!.click();
    await nextTick();

    expect(placeholders(host)).toEqual(['Date']);
    expect(doc.start_date).toBeUndefined();
    expect(doc.end_date).toBeUndefined();
  });

  it('reveals the group from a chip and never offers both representations at once', async () => {
    const doc: any = model({});
    const host = render(schema, doc);

    // Hidden until added.
    expect(placeholders(host)).toEqual([]);

    buttonByText(host, 'Date')!.click();
    await nextTick();

    // The default mode is the range form.
    expect(placeholders(host)).toEqual(['Start Date', 'End Date']);
  });
});

describe('shared form state', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: { name: { type: 'string', title: 'Name' } },
  };

  it('drives a renderer from provideFormState()', async () => {
    let form!: FormStateController;
    const host = mount({
      setup() {
        form = provideFormState({ persist: false });
        return () => h(FormRenderer as any, { schema, modelValue: { name: 'Jane' }, title: 'Person', coreFields: ['name'], persist: false });
      },
    });

    await nextTick();
    const trigger = () => host.querySelector('button[aria-expanded]')!;
    expect(trigger().getAttribute('aria-expanded')).toBe('true');

    form.collapseAll();
    await nextTick();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');

    form.expandAll();
    await nextTick();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });
});
