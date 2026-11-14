import { normalizeDiagram } from './document.mjs'
const ID = /^[\w-]{1,100}$/
const text = (v, limit) => typeof v === 'string' && v.length > 0 && v.length <= limit
const fail = reason => { throw new Error('Invalid Drawlight workspace: ' + reason) }

/** A project owns multiple diagrams and typed function declarations. */
export function normalizeWorkspace(source) {
  if (source?.version === 1 || source?.version === 2 && Array.isArray(source.nodes)) {
    return { format: 'drawlight-workspace', version: 1, activeId: 'main',
      pages: [{ id: 'main', diagram: normalizeDiagram(source) }], functions: [] }
  }
  if (!source || source.format !== 'drawlight-workspace' || source.version !== 1) fail('format')
  if (!Array.isArray(source.pages) || !source.pages.length || source.pages.length > 100) fail('pages')
  if (!Array.isArray(source.functions) || source.functions.length > 200) fail('functions')
  const pageIds = new Set()
  const pages = source.pages.map(page => {
    if (!page || !text(page.id, 100) || !ID.test(page.id) || pageIds.has(page.id)) fail('page ID')
    pageIds.add(page.id)
    return { id: page.id, diagram: normalizeDiagram(page.diagram) }
  })
  if (!pageIds.has(source.activeId)) fail('active page')
  const functionIds = new Set()
  const functions = source.functions.map(fn => {
    if (!fn || !text(fn.id, 100) || !ID.test(fn.id) || functionIds.has(fn.id)
      || !text(fn.name, 100) || !Array.isArray(fn.inputs) || !Array.isArray(fn.outputs)
      || fn.inputs.length > 20 || fn.outputs.length > 20) fail('function')
    functionIds.add(fn.id)
    const params = list => list.map(item => {
      if (!item || !text(item.name, 80) || !text(item.type, 80)) fail('function parameter')
      return { name: item.name, type: item.type }
    })
    return { id: fn.id, name: fn.name, inputs: params(fn.inputs), outputs: params(fn.outputs) }
  })
  return { format: 'drawlight-workspace', version: 1, activeId: source.activeId, pages, functions }
}
export function newWorkspace(diagram) {
  return normalizeWorkspace(diagram)
}
