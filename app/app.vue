<script setup lang="ts">
import {
  ArrowDownToLine, Check, ChevronDown, Circle, Copy, Diamond,
  Download, Focus, Grid3X3, Layers, Link2, MousePointer2, Plus, Redo2,
  Save, Trash2, Undo2, Upload, X, ZoomIn, ZoomOut
} from 'lucide-vue-next'
import { useDrawlightEditor } from './composables/useDrawlightEditor'
import type { Cardinality, MessageType } from './utils/model'

const {
    stage, fileInput, diagram, tool, selectedId, selectedEdgeId, linkingFrom,
    exportOpen, templatesOpen, toast, wasmReady, status, camera, undoStack, redoStack,
    selectedNode, selectedEdge, cameraTransform, guidePath, kinds, palette, templates,
    undo, redo, setTool, handleStageDown, handleNodeDown, handleNodeClick, startLink,
    handleStageMove, handleStageUp, handleWheel, changeZoom, fitView, updateNode,
    updateEdgeLabel, renameNode, deleteSelected, edgePath, edgeLabelPosition, selectEdge,
    copyMermaid, exportMermaid, exportJson, exportSvg, importJson, showTemplates, applyTemplate,
    setNodePosition, availableKinds, sequenceEnd, formatEntityFields, updateEntityFields, updateEdgeSemantics
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
        <button type="button" class="button secondary templates-button" @click="showTemplates"><Layers :size="16" /> Templates</button>
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
        <template v-if="diagram.kind === 'flowchart'">
          <button :class="['tool-button', { active: tool === 'process' }]" title="Process (R)" aria-label="Add process" @click="setTool('process')"><span class="shape-icon rectangle"></span><span>R</span></button>
          <button :class="['tool-button', { active: tool === 'decision' }]" title="Decision (D)" aria-label="Add decision" @click="setTool('decision')"><Diamond :size="20" /><span>D</span></button>
          <button :class="['tool-button', { active: tool === 'database' }]" title="Database (B)" aria-label="Add database" @click="setTool('database')"><span class="shape-icon cylinder"></span><span>B</span></button>
          <button :class="['tool-button', { active: tool === 'start' }]" title="Start / End (S)" aria-label="Add start" @click="setTool('start')"><Circle :size="21" /><span>S</span></button>
          <button :class="['tool-button', { active: tool === 'note' }]" title="Note (N)" aria-label="Add note" @click="setTool('note')"><span class="shape-icon note"></span><span>N</span></button>
        </template>
        <button v-else-if="diagram.kind === 'er'" :class="['tool-button', { active: tool === 'entity' }]" title="Entity table (E)" aria-label="Add entity" @click="setTool('entity')"><span class="shape-icon rectangle"></span><span>E</span></button>
        <button v-else :class="['tool-button', { active: tool === 'participant' }]" title="Participant (P)" aria-label="Add participant" @click="setTool('participant')"><span class="shape-icon rectangle"></span><span>P</span></button>
        <div class="sidebar-spacer"></div>
        <button class="tool-button" title="Templates (T)" aria-label="Browse templates" @click="showTemplates"><Layers :size="18" /></button>
      </aside>

      <main class="canvas-area">
        <div class="canvas-top-hint">
          <div class="location-pill"><Grid3X3 :size="15" /> {{ diagram.kind === 'er' ? 'ER diagram' : diagram.kind === 'sequence' ? 'Sequence diagram' : 'Flowchart' }} <span>/</span> {{ diagram.title }}</div>
          <div class="canvas-meta"><span>{{ diagram.nodes.length }} {{ diagram.kind === 'er' ? 'entities' : diagram.kind === 'sequence' ? 'participants' : 'nodes' }}</span><span class="meta-divider">·</span><span>{{ diagram.edges.length }} {{ diagram.kind === 'sequence' ? 'messages' : 'connections' }}</span></div>
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
            <g v-if="diagram.kind === 'sequence'" class="sequence-lifelines">
              <line v-for="node in diagram.nodes" :key="node.id"
                :x1="node.x + node.w / 2" :x2="node.x + node.w / 2"
                :y1="node.y + node.h" :y2="sequenceEnd"
                stroke="#b0bdd0" stroke-width="2" stroke-dasharray="8 8" />
            </g>
            <g v-for="edge in diagram.edges" :key="edge.id" :class="['edge', { selected: selectedEdgeId === edge.id }]">
              <path class="edge-line" :d="edgePath(edge)" fill="none" stroke="#8294b0" stroke-width="2.3"
                :stroke-dasharray="diagram.kind === 'sequence' && edge.messageType === 'return' ? '7 5' : undefined"
                stroke-linejoin="round" :marker-end="diagram.kind === 'er' ? undefined : 'url(#arrow-tip)'" />
              <path class="edge-hit" :d="edgePath(edge)" fill="none" stroke="transparent" stroke-width="19" @pointerdown.stop="selectEdge(edge.id)" />
              <g v-if="edge.label || diagram.kind === 'er'" :transform="`translate(${edgeLabelPosition(edge).x}, ${edgeLabelPosition(edge).y})`">
                <rect :x="-Math.max(24, edge.label.length * 3.8 + 10)" y="-13" :width="Math.max(48, edge.label.length * 7.6 + 20)" height="26" rx="8" fill="#fff" stroke="#e5eaf2" />
                <text text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="600" fill="#60708d">{{ diagram.kind === 'er' ? ((edge.cardinality === 'one-to-one' ? '1:1' : edge.cardinality === 'many-to-many' ? 'N:M' : '1:N') + ' · ' + (edge.label || 'relates')) : edge.label }}</text>
              </g>
            </g>
            <path v-if="linkingFrom" class="link-guide" :d="guidePath" stroke="#7068ec" stroke-width="2" stroke-dasharray="7 6" fill="none" />
            <g v-for="node in diagram.nodes" :key="node.id" class="diagram-node"
              :class="{ 'is-selected': selectedId === node.id, 'is-link-target': linkingFrom && linkingFrom !== node.id }"
              :transform="`translate(${node.x} ${node.y})`"
              @pointerdown.stop="handleNodeDown($event, node.id)" @click.stop="handleNodeClick(node.id)" @dblclick.stop="renameNode(node.id)">
              <g v-if="node.kind === 'entity'">
                <rect x="0" y="0" :width="node.w" :height="node.h" rx="10" fill="#fff" stroke="#a599c9" stroke-width="1.6" />
                <path :d="`M 10 0 H ${node.w-10} Q ${node.w} 0 ${node.w} 10 V 43 H 0 V 10 Q 0 0 10 0 Z`" :fill="node.color" />
                <text :x="14" y="27" font-size="15" font-weight="750" fill="#394262">{{ node.label }}</text>
                <g v-for="(field, row) in node.fields || []" :key="field.id">
                  <text x="13" :y="68 + row * 25" font-size="12" fill="#4c5e7a">
                    {{ field.key ? field.key + '  ' : '' }}{{ field.name.slice(0, 18) }}
                  </text>
                  <text :x="node.w - 12" :y="68 + row * 25" text-anchor="end" font-size="11" fill="#8b95aa">{{ field.dataType.slice(0, 12) }}</text>
                  <line v-if="row > 0" x1="10" :x2="node.w - 10" :y1="50 + row * 25" :y2="50 + row * 25" stroke="#edf0f5" />
                </g>
              </g>
              <rect v-else-if="node.kind === 'participant'" x="0" y="0" :width="node.w" :height="node.h" rx="10" :fill="node.color" stroke="#9aabc8" stroke-width="1.4" />
              <rect v-else-if="node.kind === 'process' || node.kind === 'note'" x="0" y="0" :width="node.w" :height="node.h" :rx="node.kind === 'note' ? 6 : 14" :fill="node.color" stroke="#9aabc8" stroke-width="1.4" />
              <polygon v-else-if="node.kind === 'decision'" :points="`${node.w / 2},0 ${node.w},${node.h / 2} ${node.w / 2},${node.h} 0,${node.h / 2}`" :fill="node.color" stroke="#c4a76c" stroke-width="1.4" />
              <g v-else-if="node.kind === 'database'">
                <rect x="0" y="15" :width="node.w" :height="node.h - 30" :fill="node.color" stroke="#a599c9" stroke-width="1.4" />
                <ellipse :cx="node.w / 2" cy="15" :rx="node.w / 2" ry="15" :fill="node.color" stroke="#a599c9" stroke-width="1.4" />
                <path :d="`M 0 ${node.h - 15} A ${node.w / 2} 15 0 0 0 ${node.w} ${node.h - 15}`" fill="none" stroke="#a599c9" stroke-width="1.4" />
              </g>
              <rect v-else-if="node.kind === 'start'" x="0" y="0" :width="node.w" :height="node.h" :rx="node.h / 2" :fill="node.color" stroke="#78b8ac" stroke-width="1.4" />
              <rect v-if="selectedId === node.id" class="selection-outline" x="-5" y="-5" :width="node.w + 10" :height="node.h + 10" rx="17" fill="none" stroke="#7666ed" stroke-width="2" stroke-dasharray="5 4" />
              <text v-if="node.kind !== 'entity'" :x="node.w / 2" :y="node.h / 2" text-anchor="middle" dominant-baseline="central" fill="#243450"
                font-size="14" font-weight="650" font-family="Inter, system-ui, sans-serif"
                :textLength="node.label.length > 24 ? node.w - 28 : undefined" lengthAdjust="spacingAndGlyphs">{{ node.label }}</text>
              <g class="node-port" @pointerdown.stop="startLink($event, node.id)" @click.stop>
                <circle :cx="node.w + 11" :cy="node.h / 2" r="12" fill="#fff" stroke="#7768ec" stroke-width="2" />
                <path :d="`M ${node.w + 6} ${node.h / 2} h 10 M ${node.w + 11} ${node.h / 2 - 5} v 10`" stroke="#7768ec" stroke-width="2" stroke-linecap="round" />
              </g>
            </g>
          </g>
        </svg>
        <div v-if="!diagram.nodes.length" class="empty-state">
          <div class="empty-icon"><Layers :size="30" /></div><h2>A blank canvas, endless possibilities.</h2>
          <p>Choose {{ diagram.kind === 'er' ? 'an entity' : diagram.kind === 'sequence' ? 'a participant' : 'a shape' }} on the left, then click to place it.</p>
          <button class="button primary" @click="setTool(diagram.kind === 'er' ? 'entity' : diagram.kind === 'sequence' ? 'participant' : 'process')"><Plus :size="16" /> Add your first {{ diagram.kind === 'er' ? 'entity' : diagram.kind === 'sequence' ? 'participant' : 'shape' }}</button>
        </div>
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
          <div v-if="diagram.kind === 'er' && selectedNode.kind === 'entity'" class="inspector-section">
            <div class="section-title">Table columns</div>
            <label for="entity-fields" class="field-label">One per line · name: type PK/FK</label>
            <textarea id="entity-fields" class="property-input fields-editor" rows="8"
              :value="formatEntityFields(selectedNode)"
              @change="updateEntityFields(($event.target as HTMLTextAreaElement).value)"></textarea>
          </div>
          <div class="inspector-section"><div class="section-title">Appearance</div><label class="field-label">Fill color</label>
            <div class="color-swatches"><button v-for="color in palette" :key="color" :style="{ background: color }" :class="{ active: selectedNode.color === color }" :aria-label="`Color ${color}`" @click="updateNode({ color })"><Check v-if="selectedNode.color === color" :size="13" /></button></div>
          </div>
          <div class="inspector-section"><div class="section-title">Position</div><div class="input-grid">
            <label>X <input class="property-input" type="number" :value="selectedNode.x" @change="setNodePosition('x', ($event.target as HTMLInputElement).value)" /></label>
            <label>Y <input class="property-input" type="number" :value="selectedNode.y" @change="setNodePosition('y', ($event.target as HTMLInputElement).value)" /></label>
          </div></div>
          <div class="inspector-section"><button class="danger-button" @click="deleteSelected"><Trash2 :size="15" /> Delete shape</button></div>
        </template>
        <template v-else-if="selectedEdge">
          <div class="inspector-section"><div class="selection-eyebrow"><span class="selection-chip">CONNECTION</span></div><label class="field-label">Label</label>
            <input class="property-input" :value="selectedEdge.label" maxlength="200" placeholder="e.g. HTTP" @change="updateEdgeLabel(($event.target as HTMLInputElement).value)" />
            <template v-if="diagram.kind === 'er'">
              <label for="cardinality" class="field-label semantic-label">Cardinality</label>
              <select id="cardinality" class="property-input" :value="selectedEdge.cardinality" @change="updateEdgeSemantics({ cardinality: ($event.target as HTMLSelectElement).value as Cardinality })">
                <option value="one-to-one">1 : 1</option><option value="one-to-many">1 : N</option><option value="many-to-many">N : M</option>
              </select>
            </template>
            <template v-if="diagram.kind === 'sequence'">
              <label for="message-type" class="field-label semantic-label">Message type</label>
              <select id="message-type" class="property-input" :value="selectedEdge.messageType" @change="updateEdgeSemantics({ messageType: ($event.target as HTMLSelectElement).value as MessageType })">
                <option value="call">Call</option><option value="async">Asynchronous</option><option value="return">Return</option>
              </select>
            </template>
          </div>
          <div class="inspector-section"><button class="danger-button" @click="deleteSelected"><Trash2 :size="15" /> Delete connection</button></div>
        </template>
        <template v-else>
          <div class="inspector-placeholder"><div class="inspector-illustration"><MousePointer2 :size="28" /></div><strong>Nothing selected</strong><p>Select a shape or a connection to view and edit its properties.</p></div>
          <div class="shortcuts"><div class="section-title">QUICK START</div><div><span>Add shape</span><kbd>tool</kbd> <kbd>click</kbd></div><div><span>Connect nodes</span><kbd>+</kbd> <kbd>click</kbd></div><div><span>Rename</span><kbd>double click</kbd></div><div><span>Undo</span><kbd>⌘</kbd> <kbd>Z</kbd></div><div><span>Pan</span><kbd>drag canvas</kbd></div></div>
        </template>
        <div class="inspector-footer"><div class="powered"><Circle :size="9" :fill="wasmReady ? '#48c0a4' : '#b4bed1'" :color="wasmReady ? '#48c0a4' : '#b4bed1'" /> {{ wasmReady ? 'Rust / Wasm geometry' : 'JS geometry fallback' }}</div><span>POC v0.1</span></div>
      </aside>
    </div>
    <div v-if="templatesOpen" class="template-overlay" @click.self="templatesOpen = false">
      <section class="template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-title">
        <header class="template-dialog-header">
          <div>
            <div class="template-eyebrow">DRAWLIGHT LIBRARY</div>
            <h2 id="template-title">Start with a template</h2>
            <p>Pick a starting point. You can always undo a template switch.</p>
          </div>
          <button class="template-close" aria-label="Close templates" @click="templatesOpen = false"><X :size="20" /></button>
        </header>
        <div class="template-grid">
          <button v-for="preset in templates" :key="preset.id" class="template-card"
            :aria-label="'Use ' + preset.name + ' template'" @click="applyTemplate(preset)">
            <div class="template-preview">
              <div v-if="!preset.diagram.nodes.length" class="template-blank"><Plus :size="28" /></div>
              <svg v-else viewBox="0 0 1220 520" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <line v-for="(segment, i) in preset.previewEdges" :key="i"
                  :x1="segment.x1" :y1="segment.y1" :x2="segment.x2" :y2="segment.y2"
                  stroke="#97a7c3" stroke-width="7" stroke-linecap="round" />
                <g v-for="node in preset.diagram.nodes" :key="node.id">
                  <rect :x="node.x" :y="node.y" :width="node.w" :height="node.h"
                    :rx="node.kind === 'start' ? 36 : 16" :fill="node.color" stroke="#8897b4" stroke-width="3" />
                  <text :x="node.x + node.w / 2" :y="node.y + node.h / 2 + 6" text-anchor="middle"
                    font-size="20" font-weight="700" fill="#46536c">{{ node.label.length > 17 ? node.label.slice(0, 16) + '…' : node.label }}</text>
                </g>
              </svg>
            </div>
            <div class="template-description">
              <span class="template-category">{{ preset.category }}</span>
              <strong>{{ preset.name }}</strong>
              <span class="template-detail">{{ preset.description }}</span>
              <span class="template-node-count">{{ preset.diagram.nodes.length }} shapes · {{ preset.diagram.edges.length }} connections</span>
            </div>
          </button>
        </div>
      </section>
    </div>
    <Transition name="toast"><div v-if="toast" class="toast-message"><Check :size="16" /> {{ toast }}</div></Transition>
  </div>
</template>
