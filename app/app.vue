<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  ArrowDownToLine, ArrowLeftRight, Check, ChevronDown, Circle, Copy, Diamond,
  Download, Focus, Grid3X3, Layers, Link2, Minus, MousePointer2, Plus, Redo2,
  RotateCcw, Save, Trash2, Undo2, Upload, X, ZoomIn, ZoomOut
} from 'lucide-vue-next'
import { cloneDiagram, demo, GRID, kinds, newNode, palette, parseDiagram } from './utils/model'
import type { Diagram, DiagramEdge, DiagramNode, NodeKind, Tool } from './utils/model'
import { initGeometry, pathBetween, snap } from './utils/geometry'
import { toMermaid } from './utils/mermaid'

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
const toast = ref('')
const wasmReady = ref(false)
const status = ref<'local' | 'connected' | 'saving' | 'offline'>('local')
const camera = reactive({ x: 0, y: 0, zoom: 1 })
const cursor = reactive({ x: 0, y: 0 })
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const selectedNode = computed(() => diagram.value.nodes.find(n => n.id === selectedId.value) || null)
const selectedEdge = computed(() => diagram.value.edges.find(e => e.id === selectedEdgeId.value) || null)
const nodeMap = computed(() => new Map(diagram.value.nodes.map(n => [n.id, n])))
const count = computed(() => diagram.value.nodes.length + diagram.value.edges.length)
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
let pollTimer: ReturnType<typeof setInterval> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined

function flash(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2500)
}
function snapshot() { return JSON.stringify(diagram.value) }
function checkpoint(before: string) {
  if (snapshot() === before) return
  undoStack.value.push(before)
  if (undoStack.value.length > 80) undoStack.value.shift()
  redoStack.value = []
}
function undo() {
  const before = undoStack.value.pop()
  if (!before) return
  redoStack.value.push(snapshot())
  diagram.value = parseDiagram(JSON.parse(before))
  clearSelection()
}
function redo() {
  const after = redoStack.value.pop()
  if (!after) return
  undoStack.value.push(snapshot())
  diagram.value = parseDiagram(JSON.parse(after))
  clearSelection()
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
    const node = newNode(tool.value as NodeKind, snap(point.x - 88, GRID), snap(point.y - 44, GRID))
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
    before: snapshot(), moved: false
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
  if (from === to) { flash('Choose a different destination'); return }
  if (diagram.value.edges.some(e => e.from === from && e.to === to)) { flash('Already connected'); return }
  const before = snapshot()
  diagram.value.edges.push({ id: crypto.randomUUID(), from, to, label: '' })
  checkpoint(before)
  flash('Connected!')
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
    node.y = snap(gesture.originalY + dy / camera.zoom, GRID)
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
  const maxY = Math.max(...nodes.map(n => n.y + n.h))
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
  if (event.key === 'Escape') { setTool('select'); exportOpen.value = false }
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected() }
  const shortcuts: Record<string, Tool> = { v: 'select', r: 'process', d: 'decision', b: 'database', s: 'start', n: 'note' }
  const mapped = shortcuts[event.key.toLowerCase()]
  if (mapped) setTool(mapped)
}
function onKeyUp(event: KeyboardEvent) { if (event.code === 'Space') isSpaceDown = false }
function onBlur() { isSpaceDown = false; gesture = null }
function edgePath(edge: DiagramEdge) {
  const a = nodeMap.value.get(edge.from)
  const b = nodeMap.value.get(edge.to)
  return a && b ? pathBetween(a, b) : ''
}
function edgeLabelPosition(edge: DiagramEdge) {
  const a = nodeMap.value.get(edge.from), b = nodeMap.value.get(edge.to)
  if (!a || !b) return { x: 0, y: 0 }
  return { x: (a.x + a.w / 2 + b.x + b.w / 2) / 2, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 - 10 }
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
  const maxX = Math.max(...nodes.map(n => n.x + n.w)) + 48, maxY = Math.max(...nodes.map(n => n.y + n.h)) + 48
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
function resetDemo() {
  if (!confirm('Replace the current diagram with the demo?')) return
  const before = snapshot()
  diagram.value = cloneDiagram(demo)
  checkpoint(before); clearSelection()
  nextTick(fitView)
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
      undoStack.value = []
      redoStack.value = []
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

watch(diagram, (value) => {
  if (!mounted || suppressSync) return
  editedAt = Date.now()
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch {}
  if (syncEnabled) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveRemote, 750)
  }
}, { deep: true, flush: 'sync' })

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
  if (syncEnabled) {
    await loadRemote()
    pollTimer = setInterval(loadRemote, 3000)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  if (saveTimer) clearTimeout(saveTimer)
  if (pollTimer) clearInterval(pollTimer)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><div class="brand-mark"><Layers :size="20" :stroke-width="2.5" /></div><span>drawlight<span class="brand-dot">.</span></span><span class="brand-tag">BETA</span></div>
      <div class="document-name"><span class="breadcrumb">Workspace <span class="slash">/</span></span><input v-model="diagram.title" aria-label="Diagram title" maxlength="120" /><ChevronDown :size="15" class="subtle-icon" /></div>
      <div class="top-actions">
        <span class="save-status"><span :class="['status-dot', status]"></span>{{ status === 'saving' ? 'Saving…' : status === 'connected' ? 'Synced to Gleam' : status === 'offline' ? 'Local only · API offline' : 'Saved locally' }}</span>
        <span class="header-divider"></span>
        <button type="button" class="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" :disabled="!undoStack.length" @click="undo"><Undo2 :size="18" /></button>
        <button type="button" class="icon-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" :disabled="!redoStack.length" @click="redo"><Redo2 :size="18" /></button>
        <span class="header-divider"></span>
        <button type="button" class="button secondary" @click="fileInput?.click()"><Upload :size="16" /> Import</button>
        <div class="export-wrap">
          <button type="button" class="button primary" @click="exportOpen = !exportOpen"><ArrowDownToLine :size="16" /> Export <ChevronDown :size="14" /></button>
          <div v-if="exportOpen" class="export-menu">
            <button @click="copyMermaid"><Copy :size="16" /><span>Copy Mermaid<small>Paste into Markdown</small></span></button>
            <button @click="exportMermaid"><Download :size="16" /><span>Download Mermaid<small>.mmd</small></span></button>
            <button @click="exportJson"><Save :size="16" /><span>Drawlight JSON<small>Lossless editable file</small></span></button>
            <button @click="exportSvg"><Download :size="16" /><span>Export SVG<small>Vector image</small></span></button>
          </div>
        </div>
      </div>
      <input ref="fileInput" class="hidden-input" type="file" accept=".json,application/json" @change="importJson" />
    </header>

    <div class="workbench">
      <aside class="tools-panel">
        <div class="panel-caption">TOOLS</div>
        <button :class="['tool-button', { active: tool === 'select' }]" title="Select / move (V)" aria-label="Select / move" @click="setTool('select')"><MousePointer2 :size="19" /><span>V</span></button>
        <div class="tool-rule"></div>
        <div class="panel-caption">SHAPES</div>
        <button :class="['tool-button', { active: tool === 'process' }]" title="Process (R)" aria-label="Add process" @click="setTool('process')"><span class="shape-icon rectangle"></span><span>R</span></button>
        <button :class="['tool-button', { active: tool === 'decision' }]" title="Decision (D)" aria-label="Add decision" @click="setTool('decision')"><Diamond :size="20" /><span>D</span></button>
        <button :class="['tool-button', { active: tool === 'database' }]" title="Database (B)" aria-label="Add database" @click="setTool('database')"><span class="shape-icon cylinder"></span><span>B</span></button>
        <button :class="['tool-button', { active: tool === 'start' }]" title="Start / End (S)" aria-label="Add start" @click="setTool('start')"><Circle :size="21" /><span>S</span></button>
        <button :class="['tool-button', { active: tool === 'note' }]" title="Note (N)" aria-label="Add note" @click="setTool('note')"><span class="shape-icon note"></span><span>N</span></button>
        <div class="sidebar-spacer"></div>
        <button class="tool-button" title="Reset demo diagram" aria-label="Reset demo" @click="resetDemo"><RotateCcw :size="18" /></button>
      </aside>

      <main class="canvas-area">
        <div class="canvas-top-hint">
          <div class="location-pill"><Grid3X3 :size="15" /> Canvas <span>/</span> {{ diagram.title }}</div>
          <div class="canvas-meta"><span>{{ diagram.nodes.length }} nodes</span><span class="meta-divider">·</span><span>{{ diagram.edges.length }} connections</span></div>
        </div>
        <svg ref="stage" class="diagram-canvas" xmlns="http://www.w3.org/2000/svg"
          :class="{ 'placement-mode': tool !== 'select', 'link-mode': !!linkingFrom }"
          @pointerdown="handleStageDown" @pointermove="handleStageMove" @pointerup="handleStageUp"
          @pointercancel="handleStageUp" @wheel.prevent="handleWheel" @contextmenu.prevent>
          <defs>
            <pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.85" fill="#cfd7e5" /></pattern>
            <marker id="arrow-tip" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#7e92b5" /></marker>
          </defs>
          <g id="diagram-layer" :transform="cameraTransform">
            <rect class="grid-canvas" x="-10000" y="-10000" width="20000" height="20000" fill="url(#dot-grid)" />
            <g v-for="edge in diagram.edges" :key="edge.id" :class="['edge', { selected: selectedEdgeId === edge.id }]">
              <path class="edge-line" :d="edgePath(edge)" fill="none" stroke="#8294b0" stroke-width="2.3" stroke-linejoin="round" marker-end="url(#arrow-tip)" />
              <path class="edge-hit" :d="edgePath(edge)" fill="none" stroke="transparent" stroke-width="19" @pointerdown.stop="selectEdge(edge.id)" />
              <g v-if="edge.label" :transform="`translate(${edgeLabelPosition(edge).x}, ${edgeLabelPosition(edge).y})`">
                <rect :x="-Math.max(24, edge.label.length * 3.8 + 10)" y="-13" :width="Math.max(48, edge.label.length * 7.6 + 20)" height="26" rx="8" fill="#fff" stroke="#e5eaf2" />
                <text text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="600" fill="#60708d">{{ edge.label }}</text>
              </g>
            </g>
            <path v-if="linkingFrom" class="link-guide" :d="guidePath" stroke="#7068ec" stroke-width="2" stroke-dasharray="7 6" fill="none" />
            <g v-for="node in diagram.nodes" :key="node.id" class="diagram-node"
              :class="{ 'is-selected': selectedId === node.id, 'is-link-target': linkingFrom && linkingFrom !== node.id }"
              :transform="`translate(${node.x} ${node.y})`"
              @pointerdown.stop="handleNodeDown($event, node.id)" @click.stop="handleNodeClick(node.id)" @dblclick.stop="renameNode(node.id)">
              <rect v-if="node.kind === 'process' || node.kind === 'note'" x="0" y="0" :width="node.w" :height="node.h" :rx="node.kind === 'note' ? 6 : 14" :fill="node.color" stroke="#9aabc8" stroke-width="1.4" />
              <polygon v-else-if="node.kind === 'decision'" :points="`${node.w / 2},0 ${node.w},${node.h / 2} ${node.w / 2},${node.h} 0,${node.h / 2}`" :fill="node.color" stroke="#c4a76c" stroke-width="1.4" />
              <g v-else-if="node.kind === 'database'">
                <rect x="0" y="15" :width="node.w" :height="node.h - 30" :fill="node.color" stroke="#a599c9" stroke-width="1.4" />
                <ellipse :cx="node.w / 2" cy="15" :rx="node.w / 2" ry="15" :fill="node.color" stroke="#a599c9" stroke-width="1.4" />
                <path :d="`M 0 ${node.h - 15} A ${node.w / 2} 15 0 0 0 ${node.w} ${node.h - 15}`" fill="none" stroke="#a599c9" stroke-width="1.4" />
              </g>
              <rect v-else-if="node.kind === 'start'" x="0" y="0" :width="node.w" :height="node.h" :rx="node.h / 2" :fill="node.color" stroke="#78b8ac" stroke-width="1.4" />
              <rect v-if="selectedId === node.id" class="selection-outline" x="-5" y="-5" :width="node.w + 10" :height="node.h + 10" rx="17" fill="none" stroke="#7666ed" stroke-width="2" stroke-dasharray="5 4" />
              <text :x="node.w / 2" :y="node.h / 2" text-anchor="middle" dominant-baseline="central" fill="#243450"
                font-size="14" font-weight="650" font-family="Inter, system-ui, sans-serif"
                :textLength="node.label.length > 24 ? node.w - 28 : undefined" lengthAdjust="spacingAndGlyphs">{{ node.label }}</text>
              <g class="node-port" @pointerdown.stop="startLink($event, node.id)" @click.stop>
                <circle :cx="node.w + 11" :cy="node.h / 2" r="12" fill="#fff" stroke="#7768ec" stroke-width="2" />
                <path :d="`M ${node.w + 6} ${node.h / 2} h 10 M ${node.w + 11} ${node.h / 2 - 5} v 10`" stroke="#7768ec" stroke-width="2" stroke-linecap="round" />
              </g>
            </g>
          </g>
        </svg>
        <div v-if="!diagram.nodes.length" class="empty-state"><div class="empty-icon"><Layers :size="30" /></div><h2>A blank canvas, endless possibilities.</h2><p>Choose a shape on the left, then click anywhere to place it.</p><button class="button primary" @click="setTool('process')"><Plus :size="16" /> Add your first shape</button></div>
        <div class="canvas-bottom-hint"><span v-if="linkingFrom" class="link-instruction"><Link2 :size="15" /> Click a destination node · Esc to cancel</span><span v-else-if="tool !== 'select'">Click once to place {{ kinds.find(k => k.kind === tool)?.label }}</span><span v-else><MousePointer2 :size="14" /> Drag to move · Use + on a node to connect</span></div>
        <div class="zoom-controls">
          <button title="Zoom out" aria-label="Zoom out" @click="changeZoom(1 / 1.2)"><ZoomOut :size="17" /></button>
          <span>{{ Math.round(camera.zoom * 100) }}%</span>
          <button title="Zoom in" aria-label="Zoom in" @click="changeZoom(1.2)"><ZoomIn :size="17" /></button>
          <i></i>
          <button title="Fit diagram" aria-label="Fit diagram" @click="fitView"><Focus :size="17" /></button>
        </div>
      </main>

      <aside class="inspector">
        <div class="inspector-heading"><span>PROPERTIES</span><span class="inspector-icon"><Layers :size="16" /></span></div>
        <template v-if="selectedNode">
          <div class="inspector-section"><div class="selection-eyebrow"><span class="selection-chip">NODE</span><span>{{ selectedNode.kind }}</span></div>
            <label for="node-label" class="field-label">Label</label>
            <input id="node-label" class="property-input" :value="selectedNode.label" maxlength="200" @change="updateNode({ label: ($event.target as HTMLInputElement).value })" />
          </div>
          <div class="inspector-section"><div class="section-title">Appearance</div><label class="field-label">Fill color</label>
            <div class="color-swatches"><button v-for="color in palette" :key="color" :style="{ background: color }" :class="{ active: selectedNode.color === color }" :aria-label="`Color ${color}`" @click="updateNode({ color })"><Check v-if="selectedNode.color === color" :size="13" /></button></div>
          </div>
          <div class="inspector-section"><div class="section-title">Position</div><div class="input-grid">
            <label>X <input class="property-input" type="number" :value="selectedNode.x" @change="updateNode({ x: snap(Number(($event.target as HTMLInputElement).value), GRID) })" /></label>
            <label>Y <input class="property-input" type="number" :value="selectedNode.y" @change="updateNode({ y: snap(Number(($event.target as HTMLInputElement).value), GRID) })" /></label>
          </div></div>
          <div class="inspector-section"><button class="danger-button" @click="deleteSelected"><Trash2 :size="15" /> Delete shape</button></div>
        </template>
        <template v-else-if="selectedEdge">
          <div class="inspector-section"><div class="selection-eyebrow"><span class="selection-chip">CONNECTION</span></div><label class="field-label">Label</label>
            <input class="property-input" :value="selectedEdge.label" maxlength="200" placeholder="e.g. HTTP" @change="updateEdgeLabel(($event.target as HTMLInputElement).value)" /></div>
          <div class="inspector-section"><button class="danger-button" @click="deleteSelected"><Trash2 :size="15" /> Delete connection</button></div>
        </template>
        <template v-else>
          <div class="inspector-placeholder"><div class="inspector-illustration"><MousePointer2 :size="28" /></div><strong>Nothing selected</strong><p>Select a shape or a connection to view and edit its properties.</p></div>
          <div class="shortcuts"><div class="section-title">QUICK START</div><div><span>Add shape</span><kbd>tool</kbd> <kbd>click</kbd></div><div><span>Connect nodes</span><kbd>+</kbd> <kbd>click</kbd></div><div><span>Rename</span><kbd>double click</kbd></div><div><span>Undo</span><kbd>⌘</kbd> <kbd>Z</kbd></div><div><span>Pan</span><kbd>drag canvas</kbd></div></div>
        </template>
        <div class="inspector-footer"><div class="powered"><Circle :size="9" :fill="wasmReady ? '#48c0a4' : '#b4bed1'" :color="wasmReady ? '#48c0a4' : '#b4bed1'" /> {{ wasmReady ? 'Rust / Wasm geometry' : 'JS geometry fallback' }}</div><span>POC v0.1</span></div>
      </aside>
    </div>
    <Transition name="toast"><div v-if="toast" class="toast-message"><Check :size="16" /> {{ toast }}</div></Transition>
  </div>
</template>
