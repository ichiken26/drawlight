import assert from 'node:assert/strict'
import test from 'node:test'
import { demo, newNode, parseDiagram, cloneDiagram } from '../app/utils/model'
import { toMermaid } from '../app/utils/mermaid'
import { templates } from '../app/utils/templates'
import { orthogonalPath } from '../app/utils/geometry'

test('initial diagram is valid and non-destructive to clone', () => {
  const parsed = parseDiagram(demo)
  assert.equal(parsed.nodes.length, 4)
  const copy = cloneDiagram(parsed)
  copy.nodes[0]!.label = 'Changed'
  assert.notEqual(parsed.nodes[0]!.label, copy.nodes[0]!.label)
})
test('export includes nodes and semantic edges', () => {
  const m = toMermaid(demo)
  assert.match(m, /^flowchart LR/)
  assert.match(m, /n1 -->\|"HTTP"\| n2/)
  assert.match(m, /n2\{"API request\?"\}/)
})
test('export escapes Mermaid-sensitive user labels', () => {
  const d = cloneDiagram(demo)
  d.nodes[0]!.label = 'A "B" <C> & D | E'
  const m = toMermaid(d)
  assert.match(m, /#quot;/)
  assert.match(m, /#lt;/)
  assert.match(m, /#124;/)
})
test('malformed imported diagrams are rejected', () => {
  const d = cloneDiagram(demo)
  d.edges[0]!.to = 'unknown'
  assert.throws(() => parseDiagram(d))
  const e = cloneDiagram(demo)
  e.nodes[0]!.x = Infinity
  assert.throws(() => parseDiagram(e))
})
test('orthogonal path and default dimensions', () => {
  assert.equal(orthogonalPath(0, 0, 100, 60), 'M 0 0 L 50 0 L 50 60 L 100 60')
  const node = newNode('database', 30, 40)
  assert.equal(node.w, 176)
  assert.equal(node.kind, 'database')
})

test('all six engineering templates have stable IDs and valid documents', () => {
  assert.equal(templates.length, 6)
  for (const preset of templates) {
    assert.equal(parseDiagram(preset.diagram).nodes.length, preset.diagram.nodes.length)
    assert.equal(new Set(preset.diagram.nodes.map(n => n.id)).size, preset.diagram.nodes.length)
    assert.equal(new Set(preset.diagram.edges.map(e => e.id)).size, preset.diagram.edges.length)
    assert.equal(preset.previewEdges.length, preset.diagram.edges.length)
    assert.match(toMermaid(preset.diagram), /^flowchart LR/)
  }
  assert.equal(templates.find(t => t.id === 'blank')?.diagram.nodes.length, 0)
})
