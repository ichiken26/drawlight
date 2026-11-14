import assert from 'node:assert/strict'
import test from 'node:test'
import { demo, newNode, parseDiagram, cloneDiagram, createWorkspace, parseWorkspace } from '../app/utils/model'
import { referenceOptions, resolveReferences, filterCompletions, insertCompletion } from '../shared/references.mjs'
import { toMermaid } from '../app/utils/mermaid'
import { templates } from '../app/utils/templates'
import { orthogonalPath } from '../app/utils/geometry'
import { createConnection, formatEntityFields, parseEntityFields, sequenceY, toolsFor } from '../app/utils/diagramSemantics'

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

test('all engineering templates have stable IDs and valid semantic documents', () => {
  assert.equal(templates.length, 9)
  for (const preset of templates) {
    assert.equal(parseDiagram(preset.diagram).nodes.length, preset.diagram.nodes.length)
    assert.equal(new Set(preset.diagram.nodes.map(n => n.id)).size, preset.diagram.nodes.length)
    assert.equal(new Set(preset.diagram.edges.map(e => e.id)).size, preset.diagram.edges.length)
    assert.equal(preset.previewEdges.length, preset.diagram.edges.length)
    assert.match(toMermaid(preset.diagram), preset.diagram.kind === 'er' ? /^erDiagram/ : preset.diagram.kind === 'sequence' ? /^sequenceDiagram/ : /^flowchart LR/)
  }
  assert.equal(templates.find(t => t.id === 'blank')?.diagram.nodes.length, 0)
})

test('v1 data migrates to canonical version 2 without mutating the input', () => {
  const legacy = { ...cloneDiagram(demo), version: 1, kind: undefined }
  const original = JSON.stringify(legacy)
  const upgraded = parseDiagram(legacy)
  assert.equal(upgraded.version, 2)
  assert.equal(upgraded.kind, 'flowchart')
  assert.deepEqual(upgraded.nodes.map(n => n.id), legacy.nodes.map(n => n.id))
  assert.equal(JSON.stringify(legacy), original)
})

test('ER columns, PK/FK and cardinality export to valid Mermaid ER source', () => {
  const er = templates.find(t => t.id === 'er-saas')!.diagram
  const m = toMermaid(er)
  assert.match(m, /^erDiagram/)
  assert.match(m, /uuid id PK/)
  assert.match(m, /uuid owner_id FK/)
  assert.match(m, /USERS \|\|--o\{ PROJECTS/)
  assert.ok(er.nodes.every(n => n.kind === 'entity' && n.fields?.length))
  const updated = parseEntityFields('id: uuid PK\nemail: varchar\nstatus: varchar', er.nodes[0]!.fields || [])
  assert.equal(updated[0]!.id, er.nodes[0]!.fields![0]!.id)
  assert.equal(updated[2]!.name, 'status')
  assert.match(formatEntityFields({ ...er.nodes[0]!, fields: updated }), /status: varchar/)
})

test('sequence messages preserve timeline ordering, return types and repeated calls', () => {
  const sequence = templates.find(t => t.id === 'sequence-auth')!.diagram
  const source = toMermaid(sequence)
  assert.match(source, /^sequenceDiagram/)
  assert.match(source, /participant p1 as Browser/)
  assert.match(source, /p1->>p2: GET \/dashboard/)
  assert.match(source, /p4-->>p3: Session record/)
  assert.equal(sequence.edges.length, 6)
  assert.ok(sequenceY(sequence, sequence.edges[1]!) > sequenceY(sequence, sequence.edges[0]!))
  const again = createConnection(sequence, sequence.edges[0]!.from, sequence.edges[0]!.to, 'extra')
  assert.equal(again.messageType, 'call')
})

test('mode-specific validation rejects malformed semantic graphs', () => {
  const er = cloneDiagram(templates.find(t => t.id === 'er-saas')!.diagram)
  er.nodes[0]!.fields![0]!.key = 'INVALID' as 'PK'
  assert.throws(() => parseDiagram(er), /field key/)
  const seq = cloneDiagram(templates.find(t => t.id === 'sequence-auth')!.diagram)
  seq.edges[0]!.messageType = 'oops' as 'call'
  assert.throws(() => parseDiagram(seq), /message type/)
  const flow = cloneDiagram(demo)
  flow.nodes[0]!.kind = 'entity'
  assert.throws(() => parseDiagram(flow), /node/)
  assert.deepEqual(toolsFor('er'), ['entity'])
  assert.deepEqual(toolsFor('sequence'), ['participant'])
})

test('cross-diagram ER fields and functions autocomplete as live references', () => {
  const workspace = createWorkspace(demo)
  const er = cloneDiagram(templates.find(t => t.id === 'er-saas')!.diagram)
  workspace.pages.push({ id: 'schema', diagram: er })
  workspace.functions.push({
    id: 'fetch-user', name: 'fetchUser',
    inputs: [{ name: 'id', type: 'uuid' }],
    outputs: [{ name: 'user', type: 'User' }]
  })
  const candidates = referenceOptions(workspace)
  const email = candidates.find(item => item.label === 'users.email')
  const fn = candidates.find(item => item.kind === 'function')
  assert.ok(email && fn)
  assert.match(fn.label, /fetchUser\(id: uuid\) → user: User/)
  const matches = filterCompletions(workspace, '@users.e', 8)
  assert.equal(matches[0]?.key, email.key)
  const completed = insertCompletion('Get @users.e', 12, email)
  assert.match(completed.value, /\{\{field:/)
  workspace.pages[0]!.diagram.edges[0]!.label = completed.value + ' via ' + fn.token
  assert.match(resolveReferences(workspace.pages[0]!.diagram.edges[0]!.label, workspace), /users.email/)
  assert.match(toMermaid(workspace.pages[0]!.diagram, workspace), /fetchUser\(id: uuid\)/)
  er.nodes[0]!.fields![1]!.name = 'contact_email'
  assert.match(resolveReferences(workspace.pages[0]!.diagram.edges[0]!.label, workspace), /users.contact_email/)
  assert.match(toMermaid(workspace.pages[0]!.diagram, workspace), /users.contact_email/)
})

test('workspace migration, schema validation and edge label positions survive save', () => {
  const original = createWorkspace(demo)
  original.pages[0]!.diagram.edges[0]!.labelOffset = { x: 42, y: -33 }
  const copy = parseWorkspace(JSON.parse(JSON.stringify(original)))
  assert.deepEqual(copy.pages[0]!.diagram.edges[0]!.labelOffset, { x: 42, y: -33 })
  assert.equal(copy.activeId, 'main')
  const migrated = parseWorkspace(demo)
  assert.equal(migrated.pages[0]!.diagram.kind, 'flowchart')
  assert.throws(() => parseWorkspace({ ...original, activeId: 'missing' }), /active page/)
  assert.throws(() => parseDiagram({
    ...demo, edges: [{ ...demo.edges[0]!, labelOffset: { x: Infinity, y: 1 } }]
  }), /geometry/)
})
