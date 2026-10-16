import type { InjectionKey, Ref } from 'vue'
import { inject, provide, reactive, ref } from 'vue'

export interface ValidationStateStore {
  /** Once true, errors are revealed even for fields the user has not blurred yet. */
  requested: Ref<boolean>
  /** Paths of required fields that are currently empty. */
  invalid: Set<string>
  /** Reveal every validation error (e.g. right before exporting). */
  request: () => void
}

const VALIDATION_STATE_KEY: InjectionKey<ValidationStateStore> = Symbol('validation-state')

/**
 * Creates a shared validation registry for the whole form.
 * Field components add/remove their own paths, so the root can cheaply ask
 * "is anything invalid?" without walking the tree.
 */
export function provideValidationState(): ValidationStateStore {
  const requested = ref(false)
  const invalid = reactive(new Set<string>())

  const store: ValidationStateStore = {
    requested,
    invalid,
    request: () => {
      requested.value = true
    },
  }

  provide(VALIDATION_STATE_KEY, store)
  return store
}

export function useValidationState(): ValidationStateStore {
  const store = inject(VALIDATION_STATE_KEY)
  if (!store) throw new Error('useValidationState() must be used inside a component that called provideValidationState()')
  return store
}
