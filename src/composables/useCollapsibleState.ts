import type { InjectionKey, MaybeRefOrGetter, WritableComputedRef } from 'vue'
import { computed, inject, provide, toValue } from 'vue'
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

const COLLAPSIBLE_STATE_KEY: InjectionKey<CollapsibleStateStore> = Symbol('collapsible-state')

const emptyState = (): PersistedCollapseState => ({ default: true, overrides: {} })

/**
 * Creates a single collapse-state store for the whole form and persists it to
 * localStorage, so expanded/collapsed groups survive reloads.
 * Must be called from a component's `setup` (it uses `provide`).
 */
export function provideCollapsibleState(storageKey = 'rendercv-collapse-state'): CollapsibleStateStore {
  const state = useLocalStorage<PersistedCollapseState>(storageKey, emptyState())

  // Guard against stale or incompatible values from earlier versions.
  if (!state.value || typeof state.value.default !== 'boolean' || typeof state.value.overrides !== 'object' || state.value.overrides === null) {
    state.value = emptyState()
  }

  const store: CollapsibleStateStore = {
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

  provide(COLLAPSIBLE_STATE_KEY, store)
  return store
}

/**
 * Returns a writable ref bound with `v-model:open` on a `Collapsible`.
 * The key should be a stable path so the state can be restored after a reload.
 */
export function useCollapsibleStore(): CollapsibleStateStore {
  const store = inject(COLLAPSIBLE_STATE_KEY)
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
