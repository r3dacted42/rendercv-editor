import type { InjectionKey } from 'vue'
import { inject, nextTick, provide } from 'vue'
import {
  injectCollapsibleState,
  provideCollapsibleState,
  type CollapsibleStateStore,
} from './useCollapsibleState'
import { injectValidationState, provideValidationState, type ValidationStateStore } from './useValidationState'
import { injectFieldVisibility, provideFieldVisibility, type FieldVisibilityStore } from './useFieldVisibility'
import type { HydrateMode } from './usePersistedState'

/** The three UI stores plus a small imperative control surface. */
export interface FormStateController {
  collapsible: CollapsibleStateStore
  validation: ValidationStateStore
  visibility: FieldVisibilityStore
  /** Reveal every validation error and resolve `true` when nothing is invalid. */
  validate: () => Promise<boolean>
  /** Expand every group. */
  expandAll: () => void
  /** Collapse every group. */
  collapseAll: () => void
  /** Reset disclosure + validation UI state. Does not touch the bound data. */
  reset: () => void
}

export interface FormStateOptions {
  /**
   * Namespace for the persisted UI state: collapse is keyed
   * `<storageKey>-collapse-state` and disclosure `<storageKey>-field-visibility`.
   * Defaults to `rendercv`.
   */
  storageKey?: string
  /** Persist collapse + disclosure to localStorage (default `true`). */
  persist?: boolean
  /**
   * When to restore persisted state (default `immediate`). Pass `mounted` when
   * the form is part of an SSR shell, so the server-rendered markup and the
   * first client render agree.
   */
  hydrate?: HydrateMode
}

const FORM_STATE_KEY: InjectionKey<FormStateController> = Symbol('form-state')

/** Wraps an existing set of stores with the shared control surface. */
export function createFormController(
  collapsible: CollapsibleStateStore,
  validation: ValidationStateStore,
  visibility: FieldVisibilityStore,
): FormStateController {
  return {
    collapsible,
    validation,
    visibility,
    validate: async () => {
      validation.request()
      await nextTick()
      return validation.invalid.size === 0
    },
    expandAll: () => collapsible.expandAll(),
    collapseAll: () => collapsible.collapseAll(),
    reset: () => {
      validation.reset()
      visibility.reset()
      collapsible.expandAll()
    },
  }
}

/**
 * Creates and provides the full form UI state (collapse, validation, disclosure)
 * and returns a controller. Call it once above your renderer(s) to share a single
 * state — and one "expand/collapse all" — across several `<FormRenderer>`s.
 * Must be called from a component's `setup`.
 */
export function provideFormState(options: FormStateOptions = {}): FormStateController {
  const { storageKey = 'rendercv', persist = true, hydrate = 'immediate' } = options

  const collapsible = provideCollapsibleState({ storageKey: `${storageKey}-collapse-state`, persist, hydrate })
  const validation = provideValidationState()
  const visibility = provideFieldVisibility({ storageKey: `${storageKey}-field-visibility`, persist, hydrate })

  const controller = createFormController(collapsible, validation, visibility)
  provide(FORM_STATE_KEY, controller)
  return controller
}

/**
 * Reuses an ancestor's form state when one exists, otherwise creates and
 * provides it. Used by `<FormRenderer>` so a lone renderer is self-contained
 * while still sharing state with the rest of a provided tree.
 */
export function useOrProvideFormState(options: FormStateOptions = {}): FormStateController {
  const existing = inject(FORM_STATE_KEY, undefined)
  if (existing) return existing

  const storageKey = options.storageKey ?? 'rendercv'
  const hydrate = options.hydrate ?? 'immediate'
  const collapsible = injectCollapsibleState()
    ?? provideCollapsibleState({ storageKey: `${storageKey}-collapse-state`, persist: options.persist, hydrate })
  const validation = injectValidationState() ?? provideValidationState()
  const visibility = injectFieldVisibility()
    ?? provideFieldVisibility({ storageKey: `${storageKey}-field-visibility`, persist: options.persist, hydrate })

  return createFormController(collapsible, validation, visibility)
}

/**
 * The nearest provided form controller.
 * Throws when no ancestor called `provideFormState` (or rendered a `<FormRenderer>`).
 */
export function useFormState(): FormStateController {
  const controller = inject(FORM_STATE_KEY, undefined)
  if (!controller) {
    throw new Error('useFormState() must be used inside a component that called provideFormState() or rendered a <FormRenderer>')
  }
  return controller
}
