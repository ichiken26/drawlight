import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { cloneDiagram, createWorkspace, parseWorkspace, demo, GRID, kinds, newNode, palette, parseDiagram } from '../utils/model'
import type { Diagram, DiagramEdge, DiagramNode, NodeKind, Tool, Workspace, FunctionDefinition, FunctionParameter } from '../utils/model'
import { resolveReferences, referenceOptions } from '../../shared/references.mjs'
import { templates, type DiagramTemplate } from '../utils/templates'
import { initGeometry, pathBetween, snap } from '../utils/geometry'
import { useDiagramHistory } from './useDiagramHistory'
import { useDiagramFileIO } from './useDiagramFileIO'
import { createConnection, formatEntityFields, parseEntityFields, sequenceBottom, sequencePath, sequenceY, toolsFor } from '../utils/diagramSemantics'
import type { Cardinality, MessageType } from '../utils/model'

/** A single state controller for editing, history, gestures, and persistence. */
export function useDrawlightEditor() {
  const STORAGE_KEY = 'drawlight:document:v1'
  const WORKSPACE_KEY = 'drawlight:workspace:v1'
  const runtime = useRuntimeConfig()
  const syncEnabled = runtime.public.syncEnabled === true
  const stage = ref<SVGSVGElement | null>(null)
  const fileInput = ref<HTMLInputElement | null>(null)
  const diagram = ref<Diagram>(cloneDiagram(demo))
  const workspace = ref<Workspace>(createWorkspace(diagram.value))
  const workspaceOpen = ref(false)
  const pageChoices = computed(() => workspace.value.pages.map(page => ({
    id: page.id, name: page.diagram.title, kind: page.diagram.kind
  })))
  const referenceItems = computed(() => referenceOptions(workspace.value))
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
    kind: 'node' | 'pan' | 'edge-label'
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
  function syncPage() {
    const page = workspace.value.pages.find(p => p.id === workspace.value.activeId)
    if (page) page.diagram = cloneDiagram(diagram.value)
  }

  function switchPage(id: string) {
    if (id === workspace.value.activeId) return
    const next = workspace.value.pages.find(page => page.id === id)
    if (!next) return
    syncPage()
    workspace.value.activeId = id
    diagram.value = cloneDiagram(next.diagram)
    clearSelection()
    clearHistory()
    tool.value = 'select'
    scheduleSave()
    nextTick(fitView)
  }

  function createPage() {
    syncPage()
    const id = crypto.randomUUID()
    const next: Diagram = { version: 2, kind: 'flowchart', title: 'New diagram',
      nodes: [], edges: [] }
    workspace.value.pages.push({ id, diagram: cloneDiagram(next) })
    workspace.value.activeId = id
    diagram.value = next
    clearSelection()
    clearHistory()
    tool.value = 'select'
    scheduleSave()
    nextTick(fitView)
  }

  function createFunction() {
    workspace.value.functions.push({ id: crypto.randomUUID(), name: 'newFunction',
      inputs: [{ name: 'input', type: 'string' }], outputs: [{ name: 'result', type: 'boolean' }] })
    scheduleSave()
  }
  function updateFunction(fn: FunctionDefinition) {
    const index = workspace.value.functions.findIndex(item => item.id === fn.id)
    if (index < 0) return
    try {
      const candidate = parseWorkspace({
        ...workspace.value,
        functions: workspace.value.functions.map(item => item.id === fn.id ? fn : item)
      })
      workspace.value.functions = candidate.functions
      scheduleSave()
    } catch { flash('Invalid function definition') }
  }
  function deleteFunction(id: string) {
    workspace.value.functions = workspace.value.functions.filter(fn => fn.id !== id)
    scheduleSave()
  }
  function restoreWorkspace(source: Workspace) {
    workspace.value = parseWorkspace(source)
    const active = workspace.value.pages.find(p => p.id === workspace.value.activeId)!
    diagram.value = cloneDiagram(active.diagram)
    clearSelection()
    clearHistory()
    tool.value = 'select'
    scheduleSave()
    nextTick(fitView)
  }

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
    } else if (gesture.kind === 'edge-label') {
      const edge = diagram.value.edges.find(item => item.id === gesture?.id)
      if (!edge) return
      edge.labelOffset = {
        x: Math.round(gesture.originalX + dx / camera.zoom),
        y: Math.round(gesture.originalY + dy / camera.zoom)
      }
    }
  }
  function handleEdgeLabelDown(event: PointerEvent, id: string) {
    if (event.button !== 0) return
    const edge = diagram.value.edges.find(item => item.id === id)
    if (!edge) return
    selectedId.value = null
    selectedEdgeId.value = id
    linkingFrom.value = null
    gesture = { kind: 'edge-label', id, pointer: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      originalX: edge.labelOffset?.x || 0, originalY: edge.labelOffset?.y || 0,
      before: snapshot(), moved: false }
    stage.value?.setPointerCapture(event.pointerId)
  }
  function visibleEdgeLabel(edge: DiagramEdge) {
    const label = resolveReferences(edge.label, workspace.value)
    if (diagram.value.kind !== 'er') return label
    const c = edge.cardinality === 'one-to-one' ? '1:1'
      : edge.cardinality === 'many-to-many' ? 'N:M' : '1:N'
    return c + ' · ' + (label || 'relates')
  }

  function handleStageUp(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointer) return
    if (gesture.kind !== 'pan' && gesture.moved) checkpoint(gesture.before)
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
      x: (a.x + a.w / 2 + b.x + b.w / 2) / 2 + (edge.labelOffset?.x || 0),
      y: (diagram.value.kind === 'sequence'
        ? sequenceY(diagram.value, edge) - 19
        : (a.y + a.h / 2 + b.y + b.h / 2) / 2 - 10) + (edge.labelOffset?.y || 0)
    }
  }
  function selectEdge(id: string) {
    selectedEdgeId.value = id
    selectedId.value = null
    linkingFrom.value = null
  }
  const { copyMermaid, exportMermaid, exportJson, exportWorkspace, exportSvg, importJson } = useDiagramFileIO({
    diagram, workspace, stage, exportOpen, notify: flash,
    onImportWorkspace: async imported => { restoreWorkspace(imported) },
    onImport: async (imported) => {
      const before = snapshot()
      diagram.value = imported
      checkpoint(before)
      clearSelection()
      tool.value = 'select'
      await nextTick()
      fitView()
    }
  })
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
      const result = await $fetch<unknown>('/api/workspace')
      const remote = parseWorkspace(result)
      if (JSON.stringify(remote) !== JSON.stringify(workspace.value)
        && Date.now() - editedAt > 2000) {
        suppressSync = true
        workspace.value = remote
        const active = remote.pages.find(p => p.id === remote.activeId)!
        diagram.value = cloneDiagram(active.diagram)
        suppressSync = false
        clearHistory()
        clearSelection()
      }
      status.value = 'connected'
    } catch { status.value = 'offline' }
  }
  async function saveRemote() {
    if (!syncEnabled) return
    status.value = 'saving'
    try {
      syncPage()
      await $fetch('/api/workspace', { method: 'PUT', body: workspace.value })
      status.value = 'connected'
    } catch { status.value = 'offline' }
  }

  function flushLocal() {
    if (localSaveTimer) clearTimeout(localSaveTimer)
    localSaveTimer = undefined
    syncPage()
    try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace.value)) } catch { /* storage may be unavailable */ }
  }

  function scheduleSave() {
    if (!mounted || suppressSync) return
    editedAt = Date.now()
    syncPage()
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
      const stored = localStorage.getItem(WORKSPACE_KEY)
      const legacy = localStorage.getItem(STORAGE_KEY)
      if (stored || legacy) {
        workspace.value = parseWorkspace(JSON.parse(stored || legacy!))
        const current = workspace.value.pages.find(page => page.id === workspace.value.activeId)!
        diagram.value = cloneDiagram(current.diagram)
      }
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
    stage, fileInput, diagram, workspace, pageChoices, workspaceOpen, referenceItems,
    switchPage, createPage, createFunction, updateFunction, deleteFunction, restoreWorkspace,
    visibleEdgeLabel, handleEdgeLabelDown,
    tool, selectedId, selectedEdgeId, linkingFrom,
    availableKinds, sequenceEnd, formatEntityFields, updateEntityFields, updateEdgeSemantics,
    exportOpen, templatesOpen, toast, wasmReady, status, camera, undoStack, redoStack,
    selectedNode, selectedEdge, cameraTransform, guidePath, kinds, palette, templates,
    undo, redo, setTool, handleStageDown, handleNodeDown, handleNodeClick, startLink,
    handleStageMove, handleStageUp, handleWheel, changeZoom, fitView, updateNode,
    updateEdgeLabel, renameNode, deleteSelected, edgePath, edgeLabelPosition, selectEdge,
    copyMermaid, exportMermaid, exportJson, exportWorkspace, exportSvg, importJson, showTemplates, applyTemplate,
    setNodePosition
  }
}
