// Semantic exporters shared by browser, MCP, and tests.
const escapedLabel = value => String(value).replace(/&/g, '#amp;').replace(/"/g, '#quot;')
  .replace(/</g, '#lt;').replace(/>/g, '#gt;').replace(/\r?\n/g, ' ').replace(/\|/g, '#124;')
const identifier = value => {
  const safe = String(value).replace(/[^A-Za-z0-9_]/g, '_')
  return /^[A-Za-z_]/.test(safe) ? safe : '_' + safe
}
const safeField = value => identifier(value).slice(0, 80)
function flowShape(node, id) {
  const label = escapedLabel(node.label)
  switch (node.kind) {
    case 'decision': return `  ${id}{"${label}"}`
    case 'database': return `  ${id}[("${label}")]`
    case 'start': return `  ${id}(["${label}"])`
    default: return `  ${id}["${label}"]`
  }
}
function flowchart(diagram) {
  const ids = new Map(diagram.nodes.map((node, i) => [node.id, `n${i+1}`]))
  const lines = ['flowchart LR', ...diagram.nodes.map(n => flowShape(n, ids.get(n.id)))]
  for (const edge of diagram.edges) {
    const a = ids.get(edge.from), b = ids.get(edge.to)
    if (!a || !b) continue
    lines.push(edge.label ? `  ${a} -->|"${escapedLabel(edge.label)}"| ${b}` : `  ${a} --> ${b}`)
  }
  return lines.join('\n')+'\n'
}
function er(diagram) {
  const names = new Map()
  const seen = new Map()
  for (const node of diagram.nodes) {
    const base = identifier(node.label.toUpperCase())
    const suffix = (seen.get(base) || 0) + 1
    seen.set(base, suffix)
    names.set(node.id, suffix === 1 ? base : `${base}_${suffix}`)
  }
  const lines = ['erDiagram']
  for (const node of diagram.nodes) {
    lines.push(`  ${names.get(node.id)} {`)
    for (const field of node.fields || []) {
      lines.push(`    ${safeField(field.dataType)} ${safeField(field.name)}${field.key ? ' ' + field.key : ''}`)
    }
    lines.push('  }')
  }
  const symbols = {
    'one-to-one': '||--||',
    'one-to-many': '||--o{',
    'many-to-many': '}o--o{'
  }
  for (const edge of diagram.edges) {
    const a = names.get(edge.from), b = names.get(edge.to)
    if (a && b) lines.push(`  ${a} ${symbols[edge.cardinality] || symbols['one-to-many']} ${b} : "${escapedLabel(edge.label || 'relates')}"`)
  }
  return lines.join('\n')+'\n'
}
function sequence(diagram) {
  const ids = new Map(diagram.nodes.map((n, i) => [n.id, `p${i+1}`]))
  const lines = ['sequenceDiagram']
  for (const node of diagram.nodes) {
    lines.push(`  participant ${ids.get(node.id)} as ${escapedLabel(node.label).replace(/:/g, '#58;')}`)
  }
  const arrow = { call: '->>', async: '-)', return: '-->>' }
  for (const edge of diagram.edges) {
    const a = ids.get(edge.from), b = ids.get(edge.to)
    if (a && b) lines.push(`  ${a}${arrow[edge.messageType] || arrow.call}${b}: ${escapedLabel(edge.label).replace(/:/g, '#58;')}`)
  }
  return lines.join('\n')+'\n'
}
export function toMermaid(diagram) {
  switch(diagram.kind) {
    case 'er': return er(diagram)
    case 'sequence': return sequence(diagram)
    default: return flowchart(diagram)
  }
}
