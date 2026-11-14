import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { toMermaid } from '../shared/mermaid.mjs'
import { createShape, shapeDefaults } from '../shared/shapes.mjs'

const api = (process.env.DRAWLIGHT_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const server = new McpServer({ name: 'drawlight', version: '0.1.0' })
const response = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] })
const get = async () => {
  const res = await fetch(`${api}/diagram`)
  if (!res.ok) {
    if (res.status === 404) throw new Error('No saved diagram yet: open the editor with sync enabled and make an edit first.')
    throw new Error(`Drawlight API responded ${res.status}`)
  }
  return await res.json()
}
const save = async (diagram) => {
  const res = await fetch(`${api}/diagram`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(diagram) })
  if (!res.ok) throw new Error(`Failed to save: HTTP ${res.status}`)
}
const mutate = async (fn) => {
  const diagram = await get()
  const result = fn(diagram)
  await save(diagram)
  return response({ success: true, result })
}
const shapeKinds = Object.keys(shapeDefaults)

server.tool('read_diagram', 'Read the current Drawlight document and its node/edge IDs', {}, async () => response(await get()))
server.tool('add_node', 'Create a diagram node at coordinates in diagram units', {
  kind: z.enum(shapeKinds), label: z.string().min(1).max(200), x: z.number().finite(), y: z.number().finite()
}, async ({ kind, label, x, y }) => mutate(d => {
  const id = randomUUID()
  d.nodes.push(createShape(id, kind, label, x, y))
  return { id }
}))
server.tool('move_node', 'Move an existing node to diagram coordinates', {
  id: z.string(), x: z.number().finite(), y: z.number().finite()
}, async ({ id, x, y }) => mutate(d => {
  const node = d.nodes.find(n => n.id === id)
  if (!node) throw new Error('Unknown node ID')
  node.x = x; node.y = y
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
  if (d.edges.some(e => e.from === from && e.to === to)) throw new Error('Connection already exists')
  const id = randomUUID()
  d.edges.push({ id, from, to, label })
  return { id }
}))
server.tool('export_mermaid', 'Export the current diagram as Mermaid flowchart text', {}, async () => response(toMermaid(await get())))
await server.connect(new StdioServerTransport())
