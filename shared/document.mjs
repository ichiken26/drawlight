import { shapeDefaults, palette } from './shapes.mjs'

const MODES = ['flowchart', 'er', 'sequence']
const FLOW_KINDS = ['process', 'decision', 'database', 'start', 'note']
const CARDINALITIES = ['one-to-one', 'one-to-many', 'many-to-many']
const MESSAGE_TYPES = ['call', 'async', 'return']
const ID = /^[\w-]{1,100}$/
const COLOR = /^#[0-9a-fA-F]{6}$/

function fail(reason) { throw new Error('Invalid Drawlight document: ' + reason) }
function record(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }
function validId(id) { return typeof id === 'string' && ID.test(id) }
function boundedString(value, max, field) {
  if (typeof value !== 'string' || value.length > max) fail(field)
  return value
}
function coordinate(value, min = -100000, max = 100000) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail('geometry')
  return value
}
function field(raw) {
  if (!record(raw) || !validId(raw.id)) fail('entity field ID')
  const key = raw.key == null ? null : raw.key
  if (key !== null && key !== 'PK' && key !== 'FK') fail('entity field key')
  return {
    id: raw.id,
    name: boundedString(raw.name, 80, 'field name'),
    dataType: boundedString(raw.dataType, 80, 'field type'),
    key
  }
}

/**
 * A compact, versioned graph document with mode-specific semantic payloads.
 * Version 1 flowcharts are migrated on load, never modified in place.
 * The same normalizer is used by browser imports and MCP writes.
 */
export function normalizeDiagram(input) {
  if (!record(input) || (input.version !== 1 && input.version !== 2)) fail('version')
  const kind = input.version === 1 ? 'flowchart' : input.kind
  if (!MODES.includes(kind)) fail('diagram kind')
  if (!Array.isArray(input.nodes) || input.nodes.length > 1000
    || !Array.isArray(input.edges) || input.edges.length > 2000) fail('size')
  const allowed = kind === 'flowchart' ? FLOW_KINDS : [kind === 'er' ? 'entity' : 'participant']
  const ids = new Set()
  const nodes = input.nodes.map(raw => {
    if (!record(raw) || !validId(raw.id) || ids.has(raw.id) || !allowed.includes(raw.kind)) fail('node')
    ids.add(raw.id)
    const node = {
      id: raw.id, kind: raw.kind,
      label: boundedString(raw.label, 200, 'label'),
      x: coordinate(raw.x), y: coordinate(raw.y),
      w: coordinate(raw.w, 32, 3000), h: coordinate(raw.h, 32, 3000),
      color: typeof raw.color === 'string' && COLOR.test(raw.color)
        ? raw.color : shapeDefaults[raw.kind]?.color || palette[0]
    }
    if (kind !== 'er') return node
    if (!Array.isArray(raw.fields) || raw.fields.length > 60) fail('fields')
    const fields = raw.fields.map(field)
    if (new Set(fields.map(f => f.id)).size !== fields.length) fail('duplicate field IDs')
    // Keep the whole table visible without storing redundant derived height.
    return { ...node, h: Math.max(72, 50 + fields.length * 25), fields }
  })
  const edgeIds = new Set()
  const edges = input.edges.map(raw => {
    if (!record(raw) || !validId(raw.id) || edgeIds.has(raw.id) || !ids.has(raw.from)
      || !ids.has(raw.to) || raw.from === raw.to) fail('edge')
    edgeIds.add(raw.id)
    const edge = {
      id: raw.id, from: raw.from, to: raw.to,
      label: boundedString(raw.label, 200, 'edge label')
    }
    if (kind === 'er') {
      const cardinality = raw.cardinality ?? 'one-to-many'
      if (!CARDINALITIES.includes(cardinality)) fail('cardinality')
      return { ...edge, cardinality }
    }
    if (kind === 'sequence') {
      const messageType = raw.messageType ?? 'call'
      if (!MESSAGE_TYPES.includes(messageType)) fail('message type')
      return { ...edge, messageType }
    }
    return edge
  })
  return {
    version: 2, kind,
    title: typeof input.title === 'string' ? input.title.slice(0, 120) : 'Untitled diagram',
    nodes, edges
  }
}
