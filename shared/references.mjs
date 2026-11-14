/**
 * Reference tokens are stable IDs, not copied label strings. Renaming an ER
 * field or a function updates every diagram's displayed/exported label.
 */
const tokenPattern = /\{\{(field):([\w-]+):([\w-]+):([\w-]+)\}\}|\{\{(function):([\w-]+)\}\}/g
export function functionSignature(fn) {
  const ins = fn.inputs.map(p => p.name + ': ' + p.type).join(', ')
  const outs = fn.outputs.map(p => p.name + ': ' + p.type).join(', ')
  return fn.name + '(' + ins + ')' + (outs ? ' → ' + outs : '')
}
export function referenceOptions(workspace) {
  const items = []
  for (const page of workspace.pages) {
    if (page.diagram.kind !== 'er') continue
    for (const node of page.diagram.nodes) {
      for (const field of node.fields || []) {
        items.push({
          key: 'field:' + page.id + ':' + node.id + ':' + field.id,
          token: '{{field:' + page.id + ':' + node.id + ':' + field.id + '}}',
          label: node.label + '.' + field.name + ': ' + field.dataType,
          detail: (field.key ? field.key + ' · ' : '') + 'ER field',
          kind: 'field'
        })
      }
    }
  }
  for (const fn of workspace.functions) {
    items.push({ key: 'function:' + fn.id, token: '{{function:' + fn.id + '}}',
      label: functionSignature(fn), detail: 'Function · input/output', kind: 'function' })
  }
  return items
}
export function resolveReferences(value, workspace) {
  if (!workspace || !value) return value || ''
  const index = new Map(referenceOptions(workspace).map(entry => [entry.key, entry]))
  return value.replace(tokenPattern, (full, field, pageId, nodeId, fieldId, func, functionId) =>
    index.get(field ? 'field:' + pageId + ':' + nodeId + ':' + fieldId : 'function:' + functionId)?.label
      || '[missing reference]')
}
export function completionPrefix(text, cursor) {
  const left = text.slice(0, cursor)
  const match = /@?([A-Za-z0-9_.-]*)$/.exec(left)
  return match ? { query: match[1].toLowerCase(), start: left.length - match[0].length,
    triggered: match[0].startsWith('@') || match[1].length > 0 } : { query: '', start: cursor, triggered: false }
}
export function filterCompletions(workspace, text, cursor) {
  const prefix = completionPrefix(text, cursor)
  if (!prefix.triggered) return []
  return referenceOptions(workspace)
    .filter(item => item.label.toLowerCase().includes(prefix.query))
    .slice(0, 8)
}
export function insertCompletion(text, cursor, option) {
  const prefix = completionPrefix(text, cursor)
  return { value: text.slice(0, prefix.start) + option.token + text.slice(cursor),
    cursor: prefix.start + option.token.length }
}
