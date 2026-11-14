import { createShape, shapeDefaults, palette } from '../../shared/shapes.mjs'
import { normalizeDiagram } from '../../shared/document.mjs'
import { newWorkspace, normalizeWorkspace } from '../../shared/workspace.mjs'
export { shapeDefaults, palette }

export type FlowNodeKind = 'process' | 'decision' | 'database' | 'start' | 'note'
export type NodeKind = FlowNodeKind | 'entity' | 'participant'
export type DiagramKind = 'flowchart' | 'er' | 'sequence'
export type Tool = 'select' | NodeKind
export type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-many'
export type MessageType = 'call' | 'async' | 'return'

export interface EntityField {
  id: string
  name: string
  dataType: string
  key: 'PK' | 'FK' | null
}
export interface DiagramNode {
  id: string
  kind: NodeKind
  label: string
  x: number
  y: number
  w: number
  h: number
  color: string
  fields?: EntityField[]
}
export interface DiagramEdge {
  id: string
  from: string
  to: string
  label: string
  cardinality?: Cardinality
  messageType?: MessageType
  labelOffset?: { x: number; y: number }
}
export interface FunctionParameter { name: string; type: string }
export interface FunctionDefinition {
  id: string
  name: string
  inputs: FunctionParameter[]
  outputs: FunctionParameter[]
}
export interface DiagramPage { id: string; diagram: Diagram }
export interface Workspace {
  format: 'drawlight-workspace'
  version: 1
  activeId: string
  pages: DiagramPage[]
  functions: FunctionDefinition[]
}

export function createWorkspace(diagram: Diagram): Workspace { return newWorkspace(diagram) }
export function parseWorkspace(source: unknown): Workspace { return normalizeWorkspace(source) }

export interface Diagram {
  version: 2
  kind: DiagramKind
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
  { kind: 'note', label: 'Note', shortcut: 'N' },
  { kind: 'entity', label: 'Entity', shortcut: 'E' },
  { kind: 'participant', label: 'Participant', shortcut: 'P' }
]

export const demo: Diagram = {
  version: 2,
  kind: 'flowchart',
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
export function createNode(id: string, kind: NodeKind, label: string, x: number, y: number): DiagramNode {
  return createShape(id, kind, label, x, y)
}

export function newNode(kind: NodeKind, x: number, y: number): DiagramNode {
  return createShape(crypto.randomUUID(), kind, shapeDefaults[kind].label, x, y)
}

/** Validate and migrate imported v1 diagrams into canonical v2 documents. */
export function parseDiagram(input: unknown): Diagram {
  return normalizeDiagram(input)
}
