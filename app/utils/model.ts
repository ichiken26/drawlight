export type NodeKind = 'process' | 'decision' | 'database' | 'start' | 'note'
export type Tool = 'select' | NodeKind

export interface DiagramNode {
  id: string
  kind: NodeKind
  label: string
  x: number
  y: number
  w: number
  h: number
  color: string
}
export interface DiagramEdge {
  id: string
  from: string
  to: string
  label: string
}
export interface Diagram {
  version: 1
  title: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

export const GRID = 16
export const kinds: { kind: NodeKind; label: string; shortcut: string }[] = [
  { kind: 'process', label: 'Process', shortcut: 'R' },
  { kind: 'decision', label: 'Decision', shortcut: 'D' },
  { kind: 'database', label: 'Database', shortcut: 'B' },
  { kind: 'start', label: 'Start / End', shortcut: 'S' },
  { kind: 'note', label: 'Note', shortcut: 'N' }
]
export const palette = ['#e2eafc', '#d9f6ee', '#fff0cf', '#f9deeb', '#ede4fd']

export const demo: Diagram = {
  version: 1,
  title: 'System overview',
  nodes: [
    { id: 'client', kind: 'process', label: 'Nuxt UI', x: 96, y: 160, w: 176, h: 88, color: palette[0] },
    { id: 'api', kind: 'decision', label: 'API request?', x: 384, y: 156, w: 176, h: 96, color: palette[2] },
    { id: 'gleam', kind: 'process', label: 'Gleam API', x: 672, y: 80, w: 176, h: 88, color: palette[1] },
    { id: 'db', kind: 'database', label: 'Document store', x: 672, y: 288, w: 176, h: 96, color: palette[4] }
  ],
  edges: [
    { id: 'edge-1', from: 'client', to: 'api', label: 'HTTP' },
    { id: 'edge-2', from: 'api', to: 'gleam', label: 'yes' },
    { id: 'edge-3', from: 'api', to: 'db', label: 'persist' }
  ]
}

export function cloneDiagram(d: Diagram): Diagram {
  return JSON.parse(JSON.stringify(d)) as Diagram
}
export const shapeDefaults: Record<NodeKind, { w: number; h: number; label: string; color: string }> = {
  process: { w: 176, h: 88, label: 'New process', color: palette[0] },
  decision: { w: 176, h: 112, label: 'Condition?', color: palette[2] },
  database: { w: 176, h: 88, label: 'Database', color: palette[4] },
  start: { w: 144, h: 72, label: 'Start', color: palette[1] },
  note: { w: 176, h: 88, label: 'Note', color: palette[3] }
}

export function createNode(id: string, kind: NodeKind, label: string, x: number, y: number): DiagramNode {
  const defaults = shapeDefaults[kind]
  return { id, kind, label, x, y, w: defaults.w, h: defaults.h, color: defaults.color }
}

export function newNode(kind: NodeKind, x: number, y: number): DiagramNode {
  return createNode(crypto.randomUUID(), kind, shapeDefaults[kind].label, x, y)
}
export function parseDiagram(value: unknown): Diagram {
  if (!value || typeof value !== 'object') throw new Error('Invalid diagram')
  const d = value as Partial<Diagram>
  if (!Array.isArray(d.nodes) || !Array.isArray(d.edges) || d.nodes.length > 1000 || d.edges.length > 2000) {
    throw new Error('Unsupported diagram structure or size')
  }
  const validKinds = kinds.map(k => k.kind)
  const ids = new Set<string>()
  const nodes: DiagramNode[] = d.nodes.map((raw) => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[\w-]{1,100}$/.test(raw.id)
      || ids.has(raw.id) || !validKinds.includes(raw.kind)) throw new Error('Invalid node')
    ids.add(raw.id)
    for (const key of ['x', 'y', 'w', 'h'] as const) {
      if (!Number.isFinite(raw[key]) || Math.abs(raw[key]) > 100000) throw new Error('Invalid geometry')
    }
    if (raw.w < 32 || raw.h < 32 || typeof raw.label !== 'string' || raw.label.length > 200) throw new Error('Invalid label/size')
    return { id: raw.id, kind: raw.kind, label: raw.label, x: raw.x, y: raw.y, w: raw.w, h: raw.h,
      color: typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : palette[0] }
  })
  const edgeIds = new Set<string>()
  const edges: DiagramEdge[] = d.edges.map(raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[\w-]{1,100}$/.test(raw.id)
      || edgeIds.has(raw.id) || !ids.has(raw.from) || !ids.has(raw.to) || raw.from === raw.to
      || typeof raw.label !== 'string' || raw.label.length > 200) throw new Error('Invalid edge')
    edgeIds.add(raw.id)
    return { id: raw.id, from: raw.from, to: raw.to, label: raw.label }
  })
  return { version: 1, title: typeof d.title === 'string' ? d.title.slice(0, 120) : 'Untitled diagram', nodes, edges }
}
