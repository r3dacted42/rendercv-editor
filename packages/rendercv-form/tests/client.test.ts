import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, onMounted, ref, type App } from 'vue';
import {
  FormRenderer,
  createCollapsibleState,
  createFieldVisibility,
  type CollapsibleStateStore,
  type JsonSchema,
} from '../src/index';

/**
 * The client half of the persistence story: with a DOM, the stores really do
 * read and write `localStorage` — and `hydrate: 'mounted'` really does defer the
 * read until after mount (so SSR markup and the first client render agree).
 */

const schema: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    email: { default: null, title: 'Email' },
  },
};

let app: App | undefined;

const mount = (component: any, props: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(component, props);
  app.mount(host);
  return host;
};

beforeEach(() => localStorage.clear());

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

describe('persistence', () => {
  it('writes collapse state to localStorage and restores it on the next mount', async () => {
    const key = 'test-collapse';
    let store!: CollapsibleStateStore;
    mount(
      defineComponent({
        setup() {
          store = createCollapsibleState({ storageKey: key });
          return () => null;
        },
      }),
    );

    store.collapseAll();
    await nextTick();
    await nextTick();

    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ default: false, overrides: {} });

    store.setOpen('cv.sections[0]', true);
    await nextTick();
    await nextTick();
    expect(JSON.parse(localStorage.getItem(key)!).overrides).toEqual({ 'cv.sections[0]': true });

    app!.unmount();
    app = undefined;

    let restored!: CollapsibleStateStore;
    mount(
      defineComponent({
        setup() {
          restored = createCollapsibleState({ storageKey: key });
          return () => null;
        },
      }),
    );

    expect(restored.isOpen('something')).toBe(false);
    expect(restored.isOpen('cv.sections[0]')).toBe(true);
  });

  it('ignores a stale or corrupt stored value', async () => {
    const key = 'test-collapse-stale';
    localStorage.setItem(key, JSON.stringify({ default: 'yes' }));

    let store!: CollapsibleStateStore;
    mount(
      defineComponent({
        setup() {
          store = createCollapsibleState({ storageKey: key });
          return () => null;
        },
      }),
    );

    expect(store.isOpen('any')).toBe(true);
  });

  it('persists field disclosure', async () => {
    const key = 'test-visibility';
    let store!: ReturnType<typeof createFieldVisibility>;
    mount(
      defineComponent({
        setup() {
          store = createFieldVisibility({ storageKey: key });
          return () => null;
        },
      }),
    );

    store.setRevealed('cv.email', true);
    await nextTick();
    await nextTick();

    expect(JSON.parse(localStorage.getItem(key)!).revealed).toEqual({ 'cv.email': true });
  });

  it('never touches storage when `persist` is false', async () => {
    const key = 'test-memory-only';
    let store!: CollapsibleStateStore;
    mount(
      defineComponent({
        setup() {
          store = createCollapsibleState({ storageKey: key, persist: false });
          return () => null;
        },
      }),
    );

    store.collapseAll();
    await nextTick();
    await nextTick();

    expect(localStorage.getItem(key)).toBeNull();
    expect(store.isOpen('any')).toBe(false);
  });

  describe('hydrate: "mounted"', () => {
    it('renders the defaults, then restores the stored value after mount', () => {
      const key = 'test-mounted';
      localStorage.setItem(key, JSON.stringify({ default: false, overrides: {} }));

      let duringSetup: boolean | undefined;
      let afterMount: boolean | undefined;

      mount(
        defineComponent({
          setup() {
            const store = createCollapsibleState({ storageKey: key, hydrate: 'mounted' });
            duringSetup = store.isOpen('any');
            onMounted(() => {
              afterMount = store.isOpen('any');
            });
            return () => null;
          },
        }),
      );

      expect(duringSetup).toBe(true);
      expect(afterMount).toBe(false);
    });

    it('starts persisting once mounted', async () => {
      const key = 'test-mounted-write';
      let store!: CollapsibleStateStore;

      mount(
        defineComponent({
          setup() {
            store = createCollapsibleState({ storageKey: key, hydrate: 'mounted' });
            return () => null;
          },
        }),
      );

      store.setOpen('cv.name', false);
      await nextTick();
      await nextTick();

      expect(JSON.parse(localStorage.getItem(key)!).overrides).toEqual({ 'cv.name': false });
    });
  });
});

describe('<FormRenderer> in the browser', () => {
  const renderer = ref<any>(null);

  it('mounts a lone renderer and owns its collapse state', async () => {
    const host = mount({
      setup: () => () =>
        h(FormRenderer as any, {
          ref: renderer,
          schema,
          modelValue: { name: 'Jane' },
          title: 'Person',
          coreFields: ['name'],
        }),
    });

    await nextTick();

    const trigger = host.querySelector('button[aria-expanded]');
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute('aria-expanded')).toBe('true');

    (trigger as HTMLElement).click();
    await nextTick();
    await nextTick();

    expect(host.querySelector('button[aria-expanded]')!.getAttribute('aria-expanded')).toBe('false');
    // ... and the collapse survived to localStorage.
    expect(JSON.parse(localStorage.getItem('rendercv-collapse-state')!).overrides).toEqual({
      root: false,
    });
  });

  it('does not touch storage when told `persist: false`', async () => {
    const host = mount({
      setup: () => () =>
        h(FormRenderer as any, {
          schema,
          modelValue: { name: 'Jane' },
          title: 'Person',
          coreFields: ['name'],
          persist: false,
        }),
    });

    await nextTick();
    (host.querySelector('button[aria-expanded]') as HTMLElement).click();
    await nextTick();
    await nextTick();

    expect(localStorage.length).toBe(0);
  });

  it('renders its fields and hides internal markers from `output`', async () => {
    const doc = {
      name: 'Jane',
      sections: { $schemas: [{ $key: 'a', $schema: {} }], a: [] },
    };

    const host = mount({
      setup: () => () =>
        h(FormRenderer as any, {
          ref: renderer,
          schema,
          modelValue: doc,
          root: true,
          coreFields: ['name'],
        }),
    });

    await nextTick();

    const input = host.querySelector('input')!;
    expect(input.placeholder).toBe('Name');
    expect(input.value).toBe('Jane');
    expect(host.textContent).toContain('Email'); // the "add optional field" chip
    expect(renderer.value.output).toEqual({ name: 'Jane' });
  });
});
