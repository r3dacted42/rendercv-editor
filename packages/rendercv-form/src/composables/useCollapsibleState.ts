import type { InjectionKey, MaybeRefOrGetter, Ref, WritableComputedRef } from 'vue'
import { computed, inject, provide, ref, toValue } from 'vue'
import { useLocalStorage } from '@vueuse/core'

export interface PersistedCollapseState {
  /** Fallback applied to every group that has no explicit override. */
  default: boolean
  /** Per-group overrides keyed by a stable path. */
  overrides: Record<string, boolean>
}

export interface CollapsibleStateStore {
  isOpen: (key: string) => boolean
  setOpen: (key: string, open: boolean) => void
  expandAll: () => void
  collapseAll: () => void
}

export interface CollapsibleStateOptions {
  /** localStorage key. Defaults to `rendercv-collapse-state`. */
  storageKey?: string
  /** Persist to localStorage (default `true`). When `false`, state lives in memory only. */
  persist?: boolean
}

const COLLAPSIBLE_STATE_KEY: InjectionKey<CollapsibleStateStore> = Symbol('collapsible-state')

const emptyState = (): PersistedCollapseState => ({ default: true, overrides: {} })

function isState(value: unknown): value is PersistedCollapseState {
  const state = value as PersistedCollapseState
  return !!state && typeof state.default === 'boolean'
    && typeof state.overrides === 'object' && state.overrides !== null
}

/**
 * Creates a single collapse-state store. Call from a component `setup` when you
 * want persistence (it uses `useLocalStorage`). Use `provideCollapsibleState`
 * to also share it with descendant renderers.
 */
export function createCollapsibleState(options: CollapsibleStateOptions = {}): CollapsibleStateStore {
  const { storageKey = 'rendercv-collapse-state', persist = true } = options

  const state: Ref<PersistedCollapseState> = persist
    ? useLocalStorage<PersistedCollapseState>(storageKey, emptyState())
    : ref(emptyState())

  // Guard against stale or incompatible values from earlier versions.
  if (!isState(state.value)) state.value = emptyState()

  return {
    isOpen: (key) => state.value.overrides[key] ?? state.value.default,
    setOpen: (key, open) => {
      state.value = { ...state.value, overrides: { ...state.value.overrides, [key]: open } }
    },
    expandAll: () => {
      state.value = { default: true, overrides: {} }
    },
    collapseAll: () => {
      state.value = { default: false, overrides: {} }
    },
  }
}

/**
 * Creates a collapse-state store and provides it to descendants.
 * Must be called from a component's `setup` (it uses `provide`).
 */
export function provideCollapsibleState(options: CollapsibleStateOptions = {}): CollapsibleStateStore {
  const store = createCollapsibleState(options)
  provide(COLLAPSIBLE_STATE_KEY, store)
  return store
}

/** The nearest provided collapse-state store, if any (does not throw). */
export function injectCollapsibleState(): CollapsibleStateStore | undefined {
  return inject(COLLAPSIBLE_STATE_KEY, undefined)
}

/**
 * The nearest provided collapse-state store.
 * Throws when no ancestor called `provideCollapsibleState`.
 */
export function useCollapsibleStore(): CollapsibleStateStore {
  const store = injectCollapsibleState()
  if (!store) throw new Error('useCollapsibleStore() must be used inside a component that called provideCollapsibleState()')
  return store
}

/**
 * Returns a writable ref bound with `v-model:open` on a `Collapsible`.
 * The key should be a stable path so the state can be restored after a reload.
 */
export function useCollapsible(key: MaybeRefOrGetter<string>): WritableComputedRef<boolean> {
  const store = useCollapsibleStore()

  return computed({
    get: () => store.isOpen(toValue(key)),
    set: (value) => store.setOpen(toValue(key), value),
  })
}
