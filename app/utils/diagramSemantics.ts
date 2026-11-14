import type { Diagram, DiagramEdge, DiagramKind, DiagramNode, EntityField, NodeKind } from './model'

/** Domain rules live here, not in pointer event handlers. */
export function toolsFor(kind: DiagramKind): NodeKind[] {
  if (kind === 'er') return ['entity']
  if (kind === 'sequence') return ['participant']
  return ['process', 'decision', 'database', 'start', 'note']
}

export function createConnection(diagram: Diagram, from: string, to: string, id: string): DiagramEdge {
  if (from === to) throw new Error('Choose a different destination')
  if (!diagram.nodes.some(node => node.id === from) || !diagram.nodes.some(node => node.id === to))
    throw new Error('Node not found')
  if (diagram.kind !== 'sequence' && diagram.edges.some(edge => edge.from === from && edge.to === to))
    throw new Error('Already connected')
  const base = { id, from, to, label: '' }
  switch (diagram.kind) {
    case 'er': return { ...base, cardinality: 'one-to-many' }
    case 'sequence': return { ...base, messageType: 'call' }
    default: return base
  }
}

/**
 * Stable field IDs are preserved across inspector edits at the same row.
 * Each row: 'field_name: data_type PK' or 'field_name: data_type FK'.
 */
export function parseEntityFields(text: string, existing: readonly EntityField[]): EntityField[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length > 60) throw new Error('An entity supports at most 60 fields')
  // Retain stable IDs when users reorder rows. A changed name falls back
  // to the old row index, so existing references also survive a rename.
  const used = new Set<string>()
  return lines.map((line, i) => {
    const match = /^([\\w-]{1,80})\\s*:\\s*([\\w()[\\],.]{1,80})(?:\\s+(PK|FK))?$/.exec(line)
    if (!match) throw new Error(`Invalid field at line ${i + 1}; use "name: type PK"`)
    const named = existing.find(item => item.name === match[1] && !used.has(item.id))
    const byRow = existing[i] && !used.has(existing[i]!.id) ? existing[i] : undefined
    const id = (named || byRow)?.id || crypto.randomUUID()
    used.add(id)
    return {
      id,
      name: match[1]!,
      dataType: match[2]!,
      key: (match[3] as 'PK' | 'FK' | undefined) ?? null
    }
  })
}

export function formatEntityFields(node: DiagramNode): string {
  return (node.fields || []).map(field =>
    `${field.name}: ${field.dataType}${field.key ? ' ' + field.key : ''}`
  ).join('\n')
}

export function sequenceY(diagram: Diagram, edge: DiagramEdge): number {
  const top = Math.max(180, ...diagram.nodes.map(node => node.y + node.h + 52))
  return top + diagram.edges.findIndex(item => item.id === edge.id) * 64
}
export function sequenceBottom(diagram: Diagram): number {
  return Math.max(260, ...diagram.edges.map(edge => sequenceY(diagram, edge) + 48))
}
export function sequencePath(diagram: Diagram, edge: DiagramEdge): string {
  const from = diagram.nodes.find(n => n.id === edge.from)
  const to = diagram.nodes.find(n => n.id === edge.to)
  if (!from || !to) return ''
  const y = sequenceY(diagram, edge)
  return `M ${from.x + from.w / 2} ${y} L ${to.x + to.w / 2} ${y}`
}
