import type { Diagram, DiagramNode } from './model'

function quoted(text: string): string {
  // Mermaid labels have their own syntax; encode unsafe punctuation with entities.
  return text.replace(/&/g, '#amp;').replace(/"/g, '#quot;')
    .replace(/</g, '#lt;').replace(/>/g, '#gt;')
    .replace(/\r?\n/g, ' ').replace(/\|/g, '#124;')
}
function nodeLine(node: DiagramNode, id: string): string {
  const name = quoted(node.label)
  switch (node.kind) {
    case 'decision': return `  ${id}{"${name}"}`
    case 'database': return `  ${id}[("${name}")]`
    case 'start': return `  ${id}(["${name}"])`
    case 'note': return `  ${id}["${name}"]`
    default: return `  ${id}["${name}"]`
  }
}
export function toMermaid(diagram: Diagram): string {
  const ids = new Map(diagram.nodes.map((node, index) => [node.id, `n${index + 1}`]))
  const lines = ['flowchart LR', ...diagram.nodes.map(node => nodeLine(node, ids.get(node.id)!))]
  for (const edge of diagram.edges) {
    const from = ids.get(edge.from)
    const to = ids.get(edge.to)
    if (!from || !to) continue
    lines.push(edge.label
      ? `  ${from} -->|"${quoted(edge.label)}"| ${to}`
      : `  ${from} --> ${to}`)
  }
  return lines.join('\n') + '\n'
}
