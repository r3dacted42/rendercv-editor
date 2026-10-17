import type { Ref } from 'vue';
import { getCurrentInstance, onMounted, ref, watch } from 'vue';
import { StorageSerializers, useLocalStorage } from '@vueuse/core';

/** When persisted UI state is read back from storage. */
export type HydrateMode =
  /** During setup (default). Restores instantly, but the first client render may
   *  differ from the server-rendered one (a hydration mismatch). */
  | 'immediate'
  /** After mount. The server and the first client render agree, so it is the
   *  right choice when the form is part of an SSR shell. */
  | 'mounted';

export interface PersistedStateOptions<T> {
  /** localStorage key. */
  storageKey: string;
  /** Persist to localStorage (default `true`). When `false`, state is in memory only. */
  persist?: boolean;
  /** When to read persisted state back (default `immediate`). */
  hydrate?: HydrateMode;
  /** Builds a fresh default state. */
  empty: () => T;
  /** Rejects stale/incompatible values read from storage. */
  validate: (value: unknown) => boolean;
}

const serializer = StorageSerializers.object;

/**
 * A ref backed by localStorage, with the two SSR hazards handled:
 *  - there is no `localStorage` on the server, so state falls back to an
 *    in-memory ref and `window` is never touched, and
 *  - `hydrate: 'mounted'` applies the stored value after mount, so the
 *    server-rendered markup and the first client render match.
 */
export function createPersistedState<T>(options: PersistedStateOptions<T>): Ref<T> {
  const { storageKey, persist = true, hydrate = 'immediate', empty, validate } = options;

  // No persistence (or no browser): in-memory only. Never touches `window`.
  if (!persist || typeof window === 'undefined') return ref(empty()) as Ref<T>;

  if (hydrate === 'mounted' && getCurrentInstance()) {
    return useMountedState(storageKey, empty, validate);
  }

  const state: Ref<T> = useLocalStorage<T>(storageKey, empty());
  if (!validate(state.value)) state.value = empty();
  return state;
}

/**
 * Renders the defaults, then restores and starts persisting once mounted.
 * Kept separate so `useLocalStorage` never reads during setup.
 */
function useMountedState<T>(
  storageKey: string,
  empty: () => T,
  validate: (value: unknown) => boolean,
): Ref<T> {
  const state = ref(empty()) as Ref<T>;

  onMounted(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) {
        const parsed: unknown = serializer.read(raw);
        if (validate(parsed)) state.value = parsed as T;
      }
    } catch {
      // Unreadable or corrupt value — carry on with the defaults.
    }

    watch(
      state,
      (value) => {
        try {
          window.localStorage.setItem(storageKey, serializer.write(value));
        } catch {
          // Private mode or quota exceeded — persistence is best-effort.
        }
      },
      { deep: true },
    );
  });

  return state;
}
