// @vitest-environment node
//
// The SSR suite runs in a bare Node environment — no `window`, no
// `localStorage` — which is exactly what a Nitro/Nuxt server sees.
import { describe, expect, it } from 'vitest';
import cvSchemaRaw from './fixtures/rendercv-cv-schema.json?raw';
import { createSSRApp, defineComponent, h, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import {
  FormRenderer,
  createCollapsibleState,
  createFieldVisibility,
  provideFormState,
  type FormStateController,
  type JsonSchema,
} from '../src/index';

const cv = JSON.parse(cvSchemaRaw) as JsonSchema;

const schema: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name', description: 'Your full name' },
    email: { default: null, title: 'Email' },
  },
};

describe('no-DOM environment', () => {
  it('really has no window', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
  });

  it('creates a collapse store without touching localStorage', () => {
    const store = createCollapsibleState({ persist: true });

    expect(store.isOpen('any')).toBe(true);
    store.collapseAll();
    expect(store.isOpen('any')).toBe(false);
    store.setOpen('one', true);
    expect(store.isOpen('one')).toBe(true);
    expect(store.isOpen('two')).toBe(false);
  });

  it('accepts `hydrate: "mounted"` before mount', () => {
    const store = createCollapsibleState({ persist: true, hydrate: 'mounted' });
    expect(store.isOpen('root')).toBe(true);
  });

  it('creates a visibility store without touching localStorage', () => {
    const store = createFieldVisibility({ persist: true });

    expect(store.isRevealed('cv.email')).toBe(false);
    store.setRevealed('cv.email', true);
    expect(store.isRevealed('cv.email')).toBe(true);
    store.setMode('cv.date', 'single');
    expect(store.getMode('cv.date')).toBe('single');
    store.reset();
    expect(store.isRevealed('cv.email')).toBe(false);
  });
});

describe('server rendering', () => {
  it('renders a lone <FormRenderer> (no provider, no app setup)', async () => {
    const html = await renderToString(
      createSSRApp({
        setup: () => () =>
          h(FormRenderer as any, { schema, modelValue: { name: 'Jane' }, root: true, coreFields: ['name'] }),
      }),
    );

    expect(html).toContain('Name');
    expect(html).toContain('Jane');
  });

  it('forwards the class to its root element', async () => {
    const html = await renderToString(
      createSSRApp({
        setup: () => () =>
          h(FormRenderer as any, {
            schema,
            modelValue: {},
            root: true,
            coreFields: ['name'],
            class: 'my-form',
          }),
      }),
    );

    expect(html).toMatch(/<fieldset[^>]*class="[^"]*my-form/);
  });

  it('renders inside a provideFormState() shell with persist + hydrate: "mounted"', async () => {
    let form: FormStateController | undefined;

    const Shell = defineComponent({
      setup() {
        form = provideFormState({ persist: true, hydrate: 'mounted' });
        const data = ref({ name: 'Jane' });
        return () => h(FormRenderer as any, { schema, modelValue: data.value, root: true, coreFields: ['name'] });
      },
    });

    const html = await renderToString(createSSRApp(Shell));

    expect(html).toContain('Jane');
    expect(form).toBeDefined();
    // The state the renderer used is the provided one, not a private copy.
    form!.collapseAll();
    expect(form!.collapsible.isOpen('root')).toBe(false);
  });

  it('keeps the internal `$schemas` marker out of the markup', async () => {
    const entryOption = ((cv.properties as any).sections.anyOf.find((o: any) => o.type === 'object')
      .additionalProperties.anyOf as any[]).find((option) => Array.isArray(option.items?.required));

    const doc = {
      name: 'Jane Doe',
      sections: {
        $schemas: [{ $key: 'experience', $schema: entryOption }],
        experience: [{ company: 'Acme' }],
      },
    };

    const html = await renderToString(
      createSSRApp({
        setup: () => () => h(FormRenderer as any, { schema: cv, modelValue: doc, root: true, coreFields: ['name'] }),
      }),
    );

    expect(html).toContain('Experience Section');
    expect(html).not.toContain('$schemas');
    expect(html).not.toContain('$schema');
  });
});
