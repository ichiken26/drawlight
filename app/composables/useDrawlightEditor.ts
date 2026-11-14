import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { cloneDiagram, demo, GRID, kinds, newNode, palette, parseDiagram } from '../utils/model'
import type { Diagram, DiagramEdge, DiagramNode, NodeKind, Tool } from '../utils/model'
import { templates, type DiagramTemplate } from '../utils/templates'
import { initGeometry, pathBetween, snap } from '../utils/geometry'
import { toMermaid } from '../utils/mermaid'
import { useDiagramHistory } from './useDiagramHistory'
import { createConnection, formatEntityFields, parseEntityFields, sequenceBottom, sequencePath, sequenceY, toolsFor } from '../utils/diagramSemantics'
import type { Cardinality, MessageType } from '../utils/model'

/** A single state controller for editing, history, gestures, and persistence. */
export function useDrawlightEditor() {
  const STORAGE_KEY = 'drawlight:document:v1'
  const runtime = useRuntimeConfig()
  const syncEnabled = runtime.public.syncEnabled === true
  const stage = ref<SVGSVGElement | null>(null)
  const fileInput = ref<HTMLInputElement | null>(null)
  const diagram = ref<Diagram>(cloneDiagram(demo))
  const tool = ref<Tool>('select')
  const selectedId = ref<string | null>(null)
  const selectedEdgeId = ref<string | null>(null)
  const linkingFrom = ref<string | null>(null)
  const exportOpen = ref(false)
  const templatesOpen = ref(false)
  const toast = ref('')
  const wasmReady = ref(false)
  const status = ref<'local' | 'connected' | 'saving' | 'offline'>('local')
  const camera = reactive({ x: 0, y: 0, zoom: 1 })
  const cursor = reactive({ x: 0, y: 0 })
  const selectedNode = computed(() => diagram.value.nodes.find(n => n.id === selectedId.value) || null)
  const selectedEdge = computed(() => diagram.value.edges.find(e => e.id === selectedEdgeId.value) || null)
  const availableKinds = computed(() => kinds.filter(item => toolsFor(diagram.value.kind).includes(item.kind)))
  const sequenceEnd = computed(() => sequenceBottom(diagram.value))
  const nodeMap = computed(() => new Map(diagram.value.nodes.map(n => [n.id, n])))
  const cameraTransform = computed(() => `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`)
  const guidePath = computed(() => {
    if (!linkingFrom.value) return ''
    const node = nodeMap.value.get(linkingFrom.value)
    if (!node) return ''
    return `M ${node.x + node.w / 2} ${node.y + node.h / 2} L ${cursor.x} ${cursor.y}`
  })

  let gesture: null | {
    kind: 'node' | 'pan'
    id?: string
    pointer: number
    startX: number
    startY: number
    originalX: number
    originalY: number
    before: string
    moved: boolean
  } = null
  let mounted = false
  let suppressSync = false
  let isSpaceDown = false
  let editedAt = 0
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let localSaveTimer: ReturnType<typeof setTimeout> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  function flash(message: string) {
    toast.value = message
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 2500)
  }
  const { undoStack, redoStack, snapshot, checkpoint, undo, redo, clearHistory } =
    useDiagramHistory(diagram, scheduleSave, clearSelection)
  function clearSelection() {
    selectedId.value = null
    selectedEdgeId.value = null
    linkingFrom.value = null
  }
  function setTool(next: Tool) {
    tool.value = next
    clearSelection()
  }
  function worldPoint(event: PointerEvent | WheelEvent) {
    const rect = stage.value!.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left - camera.x) / camera.zoom,
      y: (event.clientY - rect.top - camera.y) / camera.zoom
    }
  }
  function handleStageDown(event: PointerEvent) {
    if (event.button !== 0 && event.button !== 1) return
    if (event.button === 0 && tool.value !== 'select' && !isSpaceDown) {
      const point = worldPoint(event)
      if (!toolsFor(diagram.value.kind).includes(tool.value as NodeKind)) return
      const node = newNode(tool.value as NodeKind, 0, 0)
      node.x = snap(point.x - node.w / 2, GRID)
      node.y = diagram.value.kind === 'sequence' ? 64 : snap(point.y - node.h / 2, GRID)
      const before = snapshot()
      diagram.value.nodes.push(node)
      checkpoint(before)
      selectedId.value = node.id
      tool.value = 'select'
      flash('Shape created · double-click to rename')
      return
    }
    if (linkingFrom.value) { linkingFrom.value = null; return }
    clearSelection()
    gesture = {
      kind: 'pan', pointer: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      originalX: camera.x, originalY: camera.y,
      before: '', moved: false // Panning never changes diagram data.
    }
    stage.value?.setPointerCapture(event.pointerId)
  }
  function handleNodeDown(event: PointerEvent, id: string) {
    if (event.button !== 0 || linkingFrom.value) return
    const node = nodeMap.value.get(id)
    if (!node) return
    tool.value = 'select'
    selectedId.value = id
    selectedEdgeId.value = null
    gesture = {
      kind: 'node', id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      originalX: node.x, originalY: node.y, before: snapshot(), moved: false
    }
    stage.value?.setPointerCapture(event.pointerId)
  }
  function handleNodeClick(id: string) {
    if (linkingFrom.value) {
      connect(linkingFrom.value, id)
      linkingFrom.value = null
      return
    }
    selectedId.value = id
    selectedEdgeId.value = null
  }
  function startLink(event: PointerEvent, id: string) {
    event.stopPropagation()
    linkingFrom.value = id
    selectedId.value = id
    selectedEdgeId.value = null
    tool.value = 'select'
    flash('Click the destination shape to connect')
  }
  function connect(from: string, to: string) {
    try {
      const edge = createConnection(diagram.value, from, to, crypto.randomUUID())
      const before = snapshot()
      diagram.value.edges.push(edge)
      checkpoint(before)
      flash(diagram.value.kind === 'sequence' ? 'Message added' : 'Connected!')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Unable to connect')
    }
  }
  function handleStageMove(event: PointerEvent) {
    const p = worldPoint(event)
    cursor.x = p.x
    cursor.y = p.y
    if (!gesture || gesture.pointer !== event.pointerId) return
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) gesture.moved = true
    if (gesture.kind === 'pan') {
      camera.x = gesture.originalX + dx
      camera.y = gesture.originalY + dy
    } else if (gesture.kind === 'node') {
      const node = nodeMap.value.get(gesture.id!)
      if (!node) return
      node.x = snap(gesture.originalX + dx / camera.zoom, GRID)
      if (diagram.value.kind !== 'sequence') node.y = snap(gesture.originalY + dy / camera.zoom, GRID)
    }
  }
  function handleStageUp(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointer) return
    if (gesture.kind === 'node' && gesture.moved) checkpoint(gesture.before)
    gesture = null
    if (stage.value?.hasPointerCapture(event.pointerId)) stage.value.releasePointerCapture(event.pointerId)
  }
  function handleWheel(event: WheelEvent) {
    const before = worldPoint(event)
    const nextZoom = Math.min(2.5, Math.max(0.25, camera.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))
    const rect = stage.value!.getBoundingClientRect()
    camera.zoom = nextZoom
    camera.x = event.clientX - rect.left - before.x * nextZoom
    camera.y = event.clientY - rect.top - before.y * nextZoom
  }
  function changeZoom(factor: number) {
    const rect = stage.value?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.width / 2
    const cy = rect.height / 2
    const wx = (cx - camera.x) / camera.zoom
    const wy = (cy - camera.y) / camera.zoom
    camera.zoom = Math.min(2.5, Math.max(0.25, camera.zoom * factor))
    camera.x = cx - wx * camera.zoom
    camera.y = cy - wy * camera.zoom
  }
  function fitView() {
    const rect = stage.value?.getBoundingClientRect()
    if (!rect) return
    if (!diagram.value.nodes.length) {
      camera.zoom = 1; camera.x = rect.width / 2 - 300; camera.y = rect.height / 2 - 200
      return
    }
    const nodes = diagram.value.nodes
    const minX = Math.min(...nodes.map(n => n.x))
    const minY = Math.min(...nodes.map(n => n.y))
    const maxX = Math.max(...nodes.map(n => n.x + n.w))
    const maxY = Math.max(...nodes.map(n => n.y + n.h), diagram.value.kind === 'sequence' ? sequenceEnd.value : 0)
    const contentW = maxX - minX + 160
    const contentH = maxY - minY + 160
    camera.zoom = Math.min(1.25, Math.max(0.25, Math.min(rect.width / contentW, rect.height / contentH)))
    camera.x = (rect.width - (minX + maxX) * camera.zoom) / 2
    camera.y = (rect.height - (minY + maxY) * camera.zoom) / 2
  }
  function updateNode(patch: Partial<DiagramNode>) {
    if (!selectedNode.value) return
    const before = snapshot()
    Object.assign(selectedNode.value, patch)
    checkpoint(before)
  }
  function updateEntityFields(text: string) {
    const node = selectedNode.value
    if (diagram.value.kind !== 'er' || !node || node.kind !== 'entity') return
    try {
      const fields = parseEntityFields(text, node.fields || [])
      const before = snapshot()
      node.fields = fields
      node.h = Math.max(72, 50 + fields.length * 25)
      checkpoint(before)
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Invalid field definition')
    }
  }
  function updateEdgeSemantics(patch: { cardinality?: Cardinality; messageType?: MessageType }) {
    const edge = selectedEdge.value
    if (!edge) return
    const before = snapshot()
    if (diagram.value.kind === 'er' && patch.cardinality) edge.cardinality = patch.cardinality
    if (diagram.value.kind === 'sequence' && patch.messageType) edge.messageType = patch.messageType
    checkpoint(before)
  }
  function updateEdgeLabel(value: string) {
    if (!selectedEdge.value || selectedEdge.value.label === value) return
    const before = snapshot()
    selectedEdge.value.label = value.slice(0, 200)
    checkpoint(before)
  }
  function renameNode(id: string) {
    const node = nodeMap.value.get(id)
    if (!node) return
    const label = window.prompt('Shape label', node.label)
    if (label !== null && label.trim() && label !== node.label) {
      const before = snapshot()
      node.label = label.trim().slice(0, 200)
      checkpoint(before)
    }
  }
  function deleteSelected() {
    if (!selectedId.value && !selectedEdgeId.value) return
    const before = snapshot()
    if (selectedId.value) {
      const id = selectedId.value
      diagram.value.nodes = diagram.value.nodes.filter(n => n.id !== id)
      diagram.value.edges = diagram.value.edges.filter(e => e.from !== id && e.to !== id)
    } else {
      diagram.value.edges = diagram.value.edges.filter(e => e.id !== selectedEdgeId.value)
    }
    checkpoint(before)
    clearSelection()
  }
  function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    if (event.code === 'Space') { event.preventDefault(); isSpaceDown = true; return }
    if (event.metaKey || event.ctrlKey) {
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
      return
    }
    if (event.key === 'Escape') {
      templatesOpen.value = false
      setTool('select')
      exportOpen.value = false
      return
    }
    if (templatesOpen.value) return
    if (event.key.toLowerCase() === 't') { showTemplates(); return }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected() }
    const shortcuts: Record<string, Tool> = { v: 'select', r: 'process', d: 'decision', b: 'database', s: 'start', n: 'note', e: 'entity', p: 'participant' }
    const mapped = shortcuts[event.key.toLowerCase()]
    if (mapped && (mapped === 'select' || toolsFor(diagram.value.kind).includes(mapped as NodeKind))) setTool(mapped)
  }
  function onKeyUp(event: KeyboardEvent) { if (event.code === 'Space') isSpaceDown = false }
  function onBlur() { isSpaceDown = false; gesture = null }
  function edgePath(edge: DiagramEdge) {
    const a = nodeMap.value.get(edge.from)
    const b = nodeMap.value.get(edge.to)
    if (diagram.value.kind === 'sequence') return sequencePath(diagram.value, edge)
    return a && b ? pathBetween(a, b) : ''
  }
  function edgeLabelPosition(edge: DiagramEdge) {
    const a = nodeMap.value.get(edge.from), b = nodeMap.value.get(edge.to)
    if (!a || !b) return { x: 0, y: 0 }
    return {
      x: (a.x + a.w / 2 + b.x + b.w / 2) / 2,
      y: diagram.value.kind === 'sequence'
        ? sequenceY(diagram.value, edge) - 19
        : (a.y + a.h / 2 + b.y + b.h / 2) / 2 - 10
    }
  }
  function selectEdge(id: string) {
    selectedEdgeId.value = id
    selectedId.value = null
    linkingFrom.value = null
  }
  function download(filename: string, value: string, type: string) {
    const url = URL.createObjectURL(new Blob([value], { type }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click(); anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function safeName() { return diagram.value.title.trim().replace(/[^\w\-]+/g, '-').replace(/^-|-$/g, '') || 'diagram' }
  async function copyMermaid() {
    try { await navigator.clipboard.writeText(toMermaid(diagram.value)); flash('Mermaid copied!') }
    catch { download(safeName() + '.mmd', toMermaid(diagram.value), 'text/plain'); flash('Downloaded Mermaid instead') }
    exportOpen.value = false
  }
  function exportMermaid() { download(safeName() + '.mmd', toMermaid(diagram.value), 'text/plain'); exportOpen.value = false; flash('Mermaid exported') }
  function exportJson() {
    download(safeName() + '.drawlight.json', JSON.stringify(diagram.value, null, 2), 'application/json')
    exportOpen.value = false; flash('Drawlight JSON exported')
  }
  function exportSvg() {
    if (!stage.value || !diagram.value.nodes.length) { flash('Add a shape first'); return }
    const svg = stage.value.cloneNode(true) as SVGSVGElement
    const nodes = diagram.value.nodes
    const minX = Math.min(...nodes.map(n => n.x)) - 48, minY = Math.min(...nodes.map(n => n.y)) - 48
    const maxX = Math.max(...nodes.map(n => n.x + n.w)) + 48, maxY = Math.max(...nodes.map(n => n.y + n.h), diagram.value.kind === 'sequence' ? sequenceEnd.value : 0) + 48
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`)
    svg.setAttribute('width', String(maxX - minX))
    svg.setAttribute('height', String(maxY - minY))
    svg.querySelector('#diagram-layer')?.setAttribute('transform', '')
    svg.querySelector('.grid-canvas')?.remove()
    svg.querySelectorAll('.node-port, .selection-outline, .link-guide, .edge-hit').forEach(el => el.remove())
    const markup = new XMLSerializer().serializeToString(svg)
    download(safeName() + '.svg', markup, 'image/svg+xml')
    exportOpen.value = false; flash('SVG exported')
  }
  async function importJson(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (file.size > 2_000_000) { flash('File is too large'); return }
    try {
      const next = parseDiagram(JSON.parse(await file.text()))
      const before = snapshot()
      diagram.value = next
      checkpoint(before); clearSelection()
      await nextTick(); fitView(); flash('Diagram imported')
    } catch { flash('Invalid Drawlight JSON') }
  }
  function showTemplates() {
    exportOpen.value = false
    templatesOpen.value = true
  }
  function applyTemplate(template: DiagramTemplate) {
    const before = snapshot()
    diagram.value = parseDiagram(cloneDiagram(template.diagram))
    checkpoint(before)
    clearSelection()
    tool.value = 'select'
    templatesOpen.value = false
    nextTick(fitView)
    flash(`${template.name} loaded · Undo to restore previous diagram`)
  }
  function setNodePosition(axis: 'x' | 'y', raw: string) {
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    updateNode({ [axis]: snap(Math.max(-100000, Math.min(100000, value)), GRID) })
  }
  async function loadRemote() {
    if (!syncEnabled || gesture || Date.now() - editedAt < 2000 || status.value === 'saving') return
    try {
      const result = await $fetch<unknown>('/api/diagram')
      const remote = parseDiagram(result)
      if (JSON.stringify(remote) !== snapshot() && Date.now() - editedAt > 2000) {
        suppressSync = true
        diagram.value = remote
        suppressSync = false
        clearHistory()
      }
      status.value = 'connected'
    } catch { status.value = 'offline' }
  }
  async function saveRemote() {
    if (!syncEnabled) return
    status.value = 'saving'
    try {
      await $fetch('/api/diagram', { method: 'PUT', body: diagram.value })
      status.value = 'connected'
    } catch { status.value = 'offline' }
  }

  function flushLocal() {
    if (localSaveTimer) clearTimeout(localSaveTimer)
    localSaveTimer = undefined
    try { localStorage.setItem(STORAGE_KEY, snapshot()) } catch { /* storage may be unavailable */ }
  }

  function scheduleSave() {
    if (!mounted || suppressSync) return
    editedAt = Date.now()
    if (localSaveTimer) clearTimeout(localSaveTimer)
    localSaveTimer = setTimeout(flushLocal, 250)
    if (syncEnabled) {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(saveRemote, 750)
    }
  }

  // Committed edits save once, not on every pointer frame.
  // The title is the only mutable field edited directly through v-model.
  watch(() => diagram.value.title, () => scheduleSave(), { flush: 'sync' })

  onMounted(async () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) diagram.value = parseDiagram(JSON.parse(stored))
    } catch { flash('Stored document was invalid; showing demo') }
    const baseURL = runtime.app.baseURL
    wasmReady.value = await initGeometry(baseURL)
    await nextTick()
    fitView()
    mounted = true
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pagehide', flushLocal)
    if (syncEnabled) {
      await loadRemote()
      pollTimer = setInterval(loadRemote, 3000)
    }
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('pagehide', flushLocal)
    if (mounted) flushLocal()
    if (saveTimer) clearTimeout(saveTimer)
    if (pollTimer) clearInterval(pollTimer)
    if (toastTimer) clearTimeout(toastTimer)
  })
  return {
    stage, fileInput, diagram, tool, selectedId, selectedEdgeId, linkingFrom,
    availableKinds, sequenceEnd, formatEntityFields, updateEntityFields, updateEdgeSemantics,
    exportOpen, templatesOpen, toast, wasmReady, status, camera, undoStack, redoStack,
    selectedNode, selectedEdge, cameraTransform, guidePath, kinds, palette, templates,
    undo, redo, setTool, handleStageDown, handleNodeDown, handleNodeClick, startLink,
    handleStageMove, handleStageUp, handleWheel, changeZoom, fitView, updateNode,
    updateEdgeLabel, renameNode, deleteSelected, edgePath, edgeLabelPosition, selectEdge,
    copyMermaid, exportMermaid, exportJson, exportSvg, importJson, showTemplates, applyTemplate,
    setNodePosition
  }
}
