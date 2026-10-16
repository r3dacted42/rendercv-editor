import type { InjectionKey } from 'vue';
import { inject, provide } from 'vue';
import { useLocalStorage } from '@vueuse/core';

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

const FIELD_VISIBILITY_KEY: InjectionKey<FieldVisibilityStore> = Symbol('field-visibility');

const emptyState = (): PersistedFieldVisibility => ({ revealed: {}, modes: {} });

/** Creates the shared visibility store. Must be called from a `setup`. */
export function provideFieldVisibility(storageKey = 'rendercv-field-visibility'): FieldVisibilityStore {
  const state = useLocalStorage<PersistedFieldVisibility>(storageKey, emptyState());

  // Guard against stale or incompatible values from earlier versions.
  if (
    !state.value
    || typeof state.value.revealed !== 'object' || state.value.revealed === null
    || typeof state.value.modes !== 'object' || state.value.modes === null
  ) {
    state.value = emptyState();
  }

  const store: FieldVisibilityStore = {
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

  provide(FIELD_VISIBILITY_KEY, store);
  return store;
}

export function useFieldVisibility(): FieldVisibilityStore {
  const store = inject(FIELD_VISIBILITY_KEY);
  if (!store) throw new Error('useFieldVisibility() must be used inside a component that called provideFieldVisibility()');
  return store;
}
