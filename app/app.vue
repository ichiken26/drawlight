<script setup lang="ts">
import {
  ArrowDownToLine, Check, ChevronDown, Circle, Copy, Diamond,
  Download, Focus, Grid3X3, Layers, Link2, MousePointer2, Plus, Redo2,
  Save, Trash2, Undo2, Upload, X, ZoomIn, ZoomOut
} from 'lucide-vue-next'
import { useDrawlightEditor } from './composables/useDrawlightEditor'

const {
    stage, fileInput, diagram, tool, selectedId, selectedEdgeId, linkingFrom,
    exportOpen, templatesOpen, toast, wasmReady, status, camera, undoStack, redoStack,
    selectedNode, selectedEdge, cameraTransform, guidePath, kinds, palette, templates,
    undo, redo, setTool, handleStageDown, handleNodeDown, handleNodeClick, startLink,
    handleStageMove, handleStageUp, handleWheel, changeZoom, fitView, updateNode,
    updateEdgeLabel, renameNode, deleteSelected, edgePath, edgeLabelPosition, selectEdge,
    copyMermaid, exportMermaid, exportJson, exportSvg, importJson, showTemplates, applyTemplate,
    setNodePosition
} = useDrawlightEditor()
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
