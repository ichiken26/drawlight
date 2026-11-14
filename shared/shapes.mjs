/** Single geometry source for Nuxt, templates and MCP. */
export const palette = Object.freeze(['#e2eafc', '#d9f6ee', '#fff0cf', '#f9deeb', '#ede4fd'])
export const shapeDefaults = Object.freeze({
  process: { w: 176, h: 88, label: 'New process', color: palette[0] },
  decision: { w: 176, h: 112, label: 'Condition?', color: palette[2] },
  database: { w: 176, h: 88, label: 'Database', color: palette[4] },
  start: { w: 144, h: 72, label: 'Start', color: palette[1] },
  note: { w: 176, h: 88, label: 'Note', color: palette[3] },
  entity: { w: 248, h: 100, label: 'new_table', color: palette[4] },
  participant: { w: 168, h: 68, label: 'Service', color: palette[0] }
})

export function createShape(id, kind, label, x, y) {
  const defaults = shapeDefaults[kind]
  if (!defaults) throw new Error('Unknown shape kind')
  const base = { id, kind, label, x, y, w: defaults.w, h: defaults.h, color: defaults.color }
  return kind === 'entity'
    ? { ...base, fields: [
      { id: id + '-id', name: 'id', dataType: 'uuid', key: 'PK' },
      { id: id + '-name', name: 'name', dataType: 'varchar', key: null }
    ] }
    : base
}
