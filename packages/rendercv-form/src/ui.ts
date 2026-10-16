/**
 * UI primitives re-exported for apps that want to build matching chrome
 * (dialogs, toolbars, buttons) around `<FormRenderer>`.
 *
 * These are the same shadcn-vue components the renderer uses internally. They
 * are optional: apps are free to bring their own and ignore this entry.
 */
export * from './components/ui/button';
export * from './components/ui/button-group';
export * from './components/ui/dialog';
export * from './components/ui/tooltip';
