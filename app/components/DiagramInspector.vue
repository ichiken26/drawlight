<script setup lang="ts">
import { Check, Circle, Layers, MousePointer2, Trash2 } from 'lucide-vue-next'
import type { Cardinality, DiagramEdge, DiagramKind, DiagramNode, MessageType } from '../utils/model'

defineProps<{
  diagramKind: DiagramKind
  selectedNode: DiagramNode | null
  selectedEdge: DiagramEdge | null
  palette: readonly string[]
  wasmReady: boolean
  formatEntityFields: (node: DiagramNode) => string
}>()

const emit = defineEmits<{
  'node-patch': [patch: Partial<DiagramNode>]
  'node-position': [axis: 'x' | 'y', raw: string]
  'entity-fields': [value: string]
  'edge-label': [value: string]
  'edge-semantics': [patch: { cardinality?: Cardinality; messageType?: MessageType }]
  'remove-selected': []
}>()
</script>

<template>
      <aside class="inspector">
        <div class="inspector-heading"><span>PROPERTIES</span><span class="inspector-icon"><Layers :size="16" /></span></div>
        <template v-if="selectedNode">
          <div class="inspector-section"><div class="selection-eyebrow"><span class="selection-chip">NODE</span><span>{{ selectedNode.kind }}</span></div>
            <label for="node-label" class="field-label">Label</label>
            <input id="node-label" class="property-input" :value="selectedNode.label" maxlength="200" @change="emit('node-patch', { label: ($event.target as HTMLInputElement).value })" />
          </div>
          <div v-if="diagramKind === 'er' && selectedNode.kind === 'entity'" class="inspector-section">
            <div class="section-title">Table columns</div>
            <label for="entity-fields" class="field-label">One per line · name: type PK/FK</label>
            <textarea id="entity-fields" class="property-input fields-editor" rows="8"
              :value="formatEntityFields(selectedNode)"
              @change="emit('entity-fields', ($event.target as HTMLTextAreaElement).value)"></textarea>
          </div>
          <div class="inspector-section"><div class="section-title">Appearance</div><label class="field-label">Fill color</label>
            <div class="color-swatches"><button v-for="color in palette" :key="color" :style="{ background: color }" :class="{ active: selectedNode.color === color }" :aria-label="`Color ${color}`" @click="emit('node-patch', { color })"><Check v-if="selectedNode.color === color" :size="13" /></button></div>
          </div>
          <div class="inspector-section"><div class="section-title">Position</div><div class="input-grid">
            <label>X <input class="property-input" type="number" :value="selectedNode.x" @change="emit('node-position', 'x', ($event.target as HTMLInputElement).value)" /></label>
            <label>Y <input class="property-input" type="number" :value="selectedNode.y" @change="emit('node-position', 'y', ($event.target as HTMLInputElement).value)" /></label>
          </div></div>
          <div class="inspector-section"><button class="danger-button" @click="emit('remove-selected')"><Trash2 :size="15" /> Delete shape</button></div>
        </template>
        <template v-else-if="selectedEdge">
          <div class="inspector-section"><div class="selection-eyebrow"><span class="selection-chip">CONNECTION</span></div><label class="field-label">Label</label>
            <input class="property-input" :value="selectedEdge.label" maxlength="200" placeholder="e.g. HTTP" @change="emit('edge-label', ($event.target as HTMLInputElement).value)" />
            <template v-if="diagramKind === 'er'">
              <label for="cardinality" class="field-label semantic-label">Cardinality</label>
              <select id="cardinality" class="property-input" :value="selectedEdge.cardinality" @change="emit('edge-semantics', { cardinality: ($event.target as HTMLSelectElement).value as Cardinality })">
                <option value="one-to-one">1 : 1</option><option value="one-to-many">1 : N</option><option value="many-to-many">N : M</option>
              </select>
            </template>
            <template v-if="diagramKind === 'sequence'">
              <label for="message-type" class="field-label semantic-label">Message type</label>
              <select id="message-type" class="property-input" :value="selectedEdge.messageType" @change="emit('edge-semantics', { messageType: ($event.target as HTMLSelectElement).value as MessageType })">
                <option value="call">Call</option><option value="async">Asynchronous</option><option value="return">Return</option>
              </select>
            </template>
          </div>
          <div class="inspector-section"><button class="danger-button" @click="emit('remove-selected')"><Trash2 :size="15" /> Delete connection</button></div>
        </template>
        <template v-else>
          <div class="inspector-placeholder"><div class="inspector-illustration"><MousePointer2 :size="28" /></div><strong>Nothing selected</strong><p>Select a shape or a connection to view and edit its properties.</p></div>
          <div class="shortcuts"><div class="section-title">QUICK START</div><div><span>Add shape</span><kbd>tool</kbd> <kbd>click</kbd></div><div><span>Connect nodes</span><kbd>+</kbd> <kbd>click</kbd></div><div><span>Rename</span><kbd>double click</kbd></div><div><span>Undo</span><kbd>⌘</kbd> <kbd>Z</kbd></div><div><span>Pan</span><kbd>drag canvas</kbd></div></div>
        </template>
        <div class="inspector-footer"><div class="powered"><Circle :size="9" :fill="wasmReady ? '#48c0a4' : '#b4bed1'" :color="wasmReady ? '#48c0a4' : '#b4bed1'" /> {{ wasmReady ? 'Rust / Wasm geometry' : 'JS geometry fallback' }}</div><span>POC v0.1</span></div>
      </aside>
</template>
