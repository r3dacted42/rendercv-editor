import type { InjectionKey } from 'vue';
import { inject, provide } from 'vue';
import { createPersistedState, type HydrateMode } from './usePersistedState';

/**
 * UI state for the optional-field disclosure, persisted to localStorage so
 * explicitly added (still empty) fields survive a reload — mirroring how the
 * collapse state is kept.
 *
 *  - `revealed` — optional fields the user added, keyed by form path.
 *  - `modes`    — the chosen representation of an exclusive group (e.g. the
 *                 Date control's "single" vs "range" choice), keyed by path.
 */

export type ExclusiveMode = 'single' | 'range';

export interface PersistedFieldVisibility {
  revealed: Record<string, boolean>;
  modes: Record<string, ExclusiveMode>;
}

export interface FieldVisibilityStore {
  isRevealed: (key: string) => boolean;
  setRevealed: (key: string, revealed: boolean) => void;
  getMode: (key: string) => ExclusiveMode | undefined;
  setMode: (key: string, mode: ExclusiveMode) => void;
  /** Clears every reveal and mode (used by "Clear Form"). */
  reset: () => void;
}

export interface FieldVisibilityOptions {
  /** localStorage key. Defaults to `rendercv-field-visibility`. */
  storageKey?: string;
  /** Persist to localStorage (default `true`). When `false`, state lives in memory only. */
  persist?: boolean;
  /**
   * When to restore persisted state (default `immediate`). Use `mounted` when
   * the renderer is part of an SSR shell, so the first client render matches the
   * server-rendered one.
   */
  hydrate?: HydrateMode;
}

const FIELD_VISIBILITY_KEY: InjectionKey<FieldVisibilityStore> = Symbol('field-visibility');

const emptyState = (): PersistedFieldVisibility => ({ revealed: {}, modes: {} });

function isState(value: unknown): value is PersistedFieldVisibility {
  const state = value as PersistedFieldVisibility;
  return !!state
    && typeof state.revealed === 'object' && state.revealed !== null
    && typeof state.modes === 'object' && state.modes !== null;
}

/** Creates a visibility store. Must be called from a `setup` when persisting. */
export function createFieldVisibility(options: FieldVisibilityOptions = {}): FieldVisibilityStore {
  const { storageKey = 'rendercv-field-visibility', persist = true, hydrate = 'immediate' } = options;

  const state = createPersistedState<PersistedFieldVisibility>({
    storageKey,
    persist,
    hydrate,
    empty: emptyState,
    validate: isState,
  });

  return {
    isRevealed: (key) => state.value.revealed[key] === true,
    setRevealed: (key, revealed) => {
      const next = { ...state.value.revealed };
      if (revealed) next[key] = true;
      else delete next[key];
      state.value = { ...state.value, revealed: next };
    },
    getMode: (key) => state.value.modes[key],
    setMode: (key, mode) => {
      state.value = { ...state.value, modes: { ...state.value.modes, [key]: mode } };
    },
    reset: () => {
      state.value = emptyState();
    },
  };
}

/** Creates and provides the visibility store. Must be called from a `setup`. */
export function provideFieldVisibility(options: FieldVisibilityOptions = {}): FieldVisibilityStore {
  const store = createFieldVisibility(options);
  provide(FIELD_VISIBILITY_KEY, store);
  return store;
}

/** The nearest provided visibility store, if any (does not throw). */
export function injectFieldVisibility(): FieldVisibilityStore | undefined {
  return inject(FIELD_VISIBILITY_KEY, undefined);
}

/**
 * The nearest provided visibility store.
 * Throws when no ancestor called `provideFieldVisibility`.
 */
export function useFieldVisibility(): FieldVisibilityStore {
  const store = injectFieldVisibility();
  if (!store) throw new Error('useFieldVisibility() must be used inside a component that called provideFieldVisibility()');
  return store;
}
