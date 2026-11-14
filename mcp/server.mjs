import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { toMermaid } from '../shared/mermaid.mjs'
import { createShape, shapeDefaults } from '../shared/shapes.mjs'
import { normalizeDiagram } from '../shared/document.mjs'
import { newWorkspace, normalizeWorkspace } from '../shared/workspace.mjs'
import { referenceOptions } from '../shared/references.mjs'

const api = (process.env.DRAWLIGHT_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const server = new McpServer({ name: 'drawlight', version: '0.1.0' })
const response = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] })
const getWorkspace = async () => {
  const res = await fetch(`${api}/workspace`)
  if (res.ok) return normalizeWorkspace(await res.json())
  if (res.status === 404) {
    const legacy = await fetch(`${api}/diagram`)
    if (legacy.ok) return newWorkspace(normalizeDiagram(await legacy.json()))
    throw new Error('No saved workspace: open the editor with sync enabled to initialize one.')
  }
  throw new Error(`Workspace request failed: HTTP ${res.status}`)
}
const writeWorkspace = async workspace => {
  const normalized = normalizeWorkspace(workspace)
  const response = await fetch(`${api}/workspace`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(normalized)
  })
  if (!response.ok) throw new Error(`Workspace save failed: HTTP ${response.status}`)
}
const activePage = workspace => {
  const page = workspace.pages.find(item => item.id === workspace.activeId)
  if (!page) throw new Error('Active diagram not found')
  return page
}
const get = async () => activePage(await getWorkspace()).diagram
const mutate = async fn => {
  const workspace = await getWorkspace()
  const page = activePage(workspace)
  const result = fn(page.diagram, workspace)
  page.diagram = normalizeDiagram(page.diagram)
  await writeWorkspace(workspace)
  return response({ success: true, result })
}
const shapeKinds = Object.keys(shapeDefaults)

server.tool('read_diagram', 'Read the current Drawlight document and its node/edge IDs', {}, async () => response(await get()))
server.tool('add_node', 'Create a diagram node at coordinates in diagram units', {
  kind: z.enum(shapeKinds), label: z.string().min(1).max(200), x: z.number().finite(), y: z.number().finite()
}, async ({ kind, label, x, y }) => mutate(d => {
  const id = randomUUID()
  const allowed = d.kind === 'er' ? ['entity'] : d.kind === 'sequence' ? ['participant'] : ['process', 'decision', 'database', 'start', 'note']
  if (!allowed.includes(kind)) throw new Error('This shape does not belong in a ' + d.kind + ' diagram')
  d.nodes.push(createShape(id, kind, label, x, d.kind === 'sequence' ? 64 : y))
  return { id }
}))
server.tool('move_node', 'Move an existing node to diagram coordinates', {
  id: z.string(), x: z.number().finite(), y: z.number().finite()
}, async ({ id, x, y }) => mutate(d => {
  const node = d.nodes.find(n => n.id === id)
  if (!node) throw new Error('Unknown node ID')
  node.x = x; if (d.kind !== 'sequence') node.y = y
  return { id, x, y }
}))
server.tool('rename_node', 'Change a node label', {
  id: z.string(), label: z.string().min(1).max(200)
}, async ({ id, label }) => mutate(d => {
  const node = d.nodes.find(n => n.id === id)
  if (!node) throw new Error('Unknown node ID')
  node.label = label
  return { id, label }
}))
server.tool('connect_nodes', 'Connect two existing node IDs with an optional label', {
  from: z.string(), to: z.string(), label: z.string().max(200).optional()
}, async ({ from, to, label = '' }) => mutate(d => {
  if (from === to || !d.nodes.some(n => n.id === from) || !d.nodes.some(n => n.id === to)) throw new Error('Invalid connection')
  if (d.kind !== 'sequence' && d.edges.some(e => e.from === from && e.to === to)) throw new Error('Connection already exists')
  const id = randomUUID()
  d.edges.push({
    id, from, to, label,
    ...(d.kind === 'er' ? { cardinality: 'one-to-many' } : {}),
    ...(d.kind === 'sequence' ? { messageType: 'call' } : {})
  })
  return { id }
}))

server.tool('add_entity_field', 'Add a typed column to an ER entity', {
  entity_id: z.string(), name: z.string().min(1).max(80),
  data_type: z.string().min(1).max(80), key: z.enum(['PK', 'FK']).optional()
}, async ({ entity_id, name, data_type, key }) => mutate(d => {
  if (d.kind !== 'er') throw new Error('Not an ER diagram')
  const node = d.nodes.find(n => n.id === entity_id)
  if (!node) throw new Error('Entity not found')
  if (node.fields.length >= 60) throw new Error('Too many fields')
  const field = { id: randomUUID(), name, dataType: data_type, key: key || null }
  node.fields.push(field)
  node.h = Math.max(72, 50 + node.fields.length * 25)
  return field
}))
server.tool('set_relationship_cardinality', 'Change 1:1, 1:N, or N:M semantics', {
  edge_id: z.string(), cardinality: z.enum(['one-to-one', 'one-to-many', 'many-to-many'])
}, async ({ edge_id, cardinality }) => mutate(d => {
  if (d.kind !== 'er') throw new Error('Not an ER diagram')
  const edge = d.edges.find(e => e.id === edge_id)
  if (!edge) throw new Error('Relationship not found')
  edge.cardinality = cardinality
  return { edge_id, cardinality }
}))
server.tool('set_message_type', 'Change the style of a sequence message', {
  edge_id: z.string(), message_type: z.enum(['call', 'async', 'return'])
}, async ({ edge_id, message_type }) => mutate(d => {
  if (d.kind !== 'sequence') throw new Error('Not a sequence diagram')
  const edge = d.edges.find(e => e.id === edge_id)
  if (!edge) throw new Error('Message not found')
  edge.messageType = message_type
  return { edge_id, message_type }
}))

server.tool('export_mermaid', 'Export the current diagram as type-specific Mermaid source', {}, async () => response(toMermaid(await get())))
server.tool('read_workspace', 'List all diagrams and typed functions in this Drawlight workspace', {}, async () => {
  const w = await getWorkspace()
  return response({ activeId: w.activeId, pages: w.pages.map(p => ({
    id: p.id, name: p.diagram.title, kind: p.diagram.kind
  })), functions: w.functions })
})
server.tool('list_references', 'Get stable completion tokens for ER fields and function signatures', {}, async () =>
  response(referenceOptions(await getWorkspace())))
server.tool('set_edge_label', 'Edit an arrow/message label; accepts stable {{field:...}} or {{function:...}} tokens', {
  edge_id: z.string(), label: z.string().max(200)
}, async ({ edge_id, label }) => mutate(d => {
  const edge = d.edges.find(item => item.id === edge_id)
  if (!edge) throw new Error('Unknown edge ID')
  edge.label = label
  return { edge_id, label }
}))
server.tool('create_diagram', 'Create a new diagram page in the shared workspace', {
  kind: z.enum(['flowchart', 'er', 'sequence']), title: z.string().min(1).max(120)
}, async ({ kind, title }) => {
  const w = await getWorkspace()
  const id = randomUUID()
  w.pages.push({ id, diagram: { version: 2, kind, title, nodes: [], edges: [] } })
  w.activeId = id
  await writeWorkspace(w)
  return response({ id, kind, title })
})
server.tool('select_diagram', 'Switch the active diagram page', {
  id: z.string()
}, async ({ id }) => {
  const w = await getWorkspace()
  if (!w.pages.some(p => p.id === id)) throw new Error('Unknown diagram ID')
  w.activeId = id
  await writeWorkspace(w)
  return response({ activeId: id })
})
const param = z.object({ name: z.string().min(1).max(80), type: z.string().min(1).max(80) })
server.tool('upsert_function', 'Define or update a typed function for Tab completion across diagrams', {
  id: z.string().optional(), name: z.string().min(1).max(100),
  inputs: z.array(param).max(20), outputs: z.array(param).max(20)
}, async ({ id, name, inputs, outputs }) => {
  const w = await getWorkspace()
  const functionId = id || randomUUID()
  const index = w.functions.findIndex(fn => fn.id === functionId)
  const def = { id: functionId, name, inputs, outputs }
  if (index >= 0) w.functions[index] = def
  else w.functions.push(def)
  await writeWorkspace(w)
  return response(def)
})
await server.connect(new StdioServerTransport())
