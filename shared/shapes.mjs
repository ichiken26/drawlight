/** Default visual semantics reused by Nuxt, templates, and MCP edits. */
export const palette = Object.freeze(['#e2eafc', '#d9f6ee', '#fff0cf', '#f9deeb', '#ede4fd'])
export const shapeDefaults = Object.freeze({
  process: { w: 176, h: 88, label: 'New process', color: palette[0] },
  decision: { w: 176, h: 112, label: 'Condition?', color: palette[2] },
  database: { w: 176, h: 88, label: 'Database', color: palette[4] },
  start: { w: 144, h: 72, label: 'Start', color: palette[1] },
  note: { w: 176, h: 88, label: 'Note', color: palette[3] }
})

export function createShape(id, kind, label, x, y) {
  const defaults = shapeDefaults[kind]
  if (!defaults) throw new Error('Unknown shape kind')
  return { id, kind, label, x, y, w: defaults.w, h: defaults.h, color: defaults.color }
}
