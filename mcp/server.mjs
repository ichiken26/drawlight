import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'

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
const shapeKinds = ['process', 'decision', 'database', 'start', 'note']
const colors = { process: '#e2eafc', decision: '#fff0cf', database: '#ede4fd', start: '#d9f6ee', note: '#f9deeb' }
const safeLabel = (s) => String(s).replace(/&/g, '#amp;').replace(/"/g, '#quot;').replace(/</g, '#lt;')
  .replace(/>/g, '#gt;').replace(/\r?\n/g, ' ').replace(/\|/g, '#124;')
const mermaid = (d) => {
  const ids = new Map(d.nodes.map((n, i) => [n.id, `n${i + 1}`]))
  const lines = ['flowchart LR']
  for (const n of d.nodes) {
    const id = ids.get(n.id), label = safeLabel(n.label)
    const syntax = n.kind === 'decision' ? `{\"${label}\"}`
      : n.kind === 'database' ? `[(\"${label}\")]`
      : n.kind === 'start' ? `([\"${label}\"])`
      : `[\"${label}\"]`
    lines.push(`  ${id}${syntax}`)
  }
  for (const e of d.edges) {
    const from = ids.get(e.from), to = ids.get(e.to)
    if (from && to) lines.push(e.label ? `  ${from} -->|\"${safeLabel(e.label)}\"| ${to}` : `  ${from} --> ${to}`)
  }
  return lines.join('\n') + '\n'
}

server.tool('read_diagram', 'Read the current Drawlight document and its node/edge IDs', {}, async () => response(await get()))
server.tool('add_node', 'Create a diagram node at coordinates in diagram units', {
  kind: z.enum(shapeKinds), label: z.string().min(1).max(200), x: z.number().finite(), y: z.number().finite()
}, async ({ kind, label, x, y }) => mutate(d => {
  const id = randomUUID()
  const w = kind === 'start' ? 144 : 176
  const h = kind === 'start' ? 72 : kind === 'decision' ? 112 : 88
  d.nodes.push({ id, kind, label, x, y, w, h, color: colors[kind] })
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
server.tool('export_mermaid', 'Export the current diagram as Mermaid flowchart text', {}, async () => response(mermaid(await get())))
await server.connect(new StdioServerTransport())
