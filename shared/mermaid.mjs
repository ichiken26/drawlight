// Canonical Mermaid exporter shared by the browser and the local MCP server.
// Mermaid is a semantic export: freeform Drawlight positions are not preserved.
function escapedLabel(value) {
  return String(value)
    .replace(/&/g, '#amp;')
    .replace(/"/g, '#quot;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '#124;')
}

function shape(node, id) {
  const label = escapedLabel(node.label)
  switch (node.kind) {
    case 'decision': return `  ${id}{"${label}"}`
    case 'database': return `  ${id}[("${label}")]`
    case 'start': return `  ${id}(["${label}"])`
    default: return `  ${id}["${label}"]`
  }
}

export function toMermaid(diagram) {
  const names = new Map(diagram.nodes.map((node, i) => [node.id, `n${i + 1}`]))
  const lines = ['flowchart LR', ...diagram.nodes.map(node => shape(node, names.get(node.id)))]
  for (const edge of diagram.edges) {
    const from = names.get(edge.from)
    const to = names.get(edge.to)
    if (!from || !to) continue
    lines.push(edge.label
      ? `  ${from} -->|"${escapedLabel(edge.label)}"| ${to}`
      : `  ${from} --> ${to}`)
  }
  return lines.join('\n') + '\n'
}
