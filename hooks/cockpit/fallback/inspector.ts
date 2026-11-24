// The inline inspector's size (spec E.46): where no dock exists, `/steps` opens the pane and the engine seats it
// inline, above the prompt. hooks/cockpit/v8/views.ts draws its card; pane.tsx asks for these rows.

/** The body rows `/steps` asks for (E.46); the engine grants what the layout spares. */
export const INSPECTOR_ROWS = 12
