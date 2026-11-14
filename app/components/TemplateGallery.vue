<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import type { DiagramTemplate } from '../utils/templates'

defineProps<{ templates: readonly DiagramTemplate[] }>()
const emit = defineEmits<{
  apply: [template: DiagramTemplate]
  close: []
}>()
</script>

<template>
<div class="template-overlay" @click.self="emit('close')">
      <section class="template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-title">
        <header class="template-dialog-header">
          <div>
            <div class="template-eyebrow">DRAWLIGHT LIBRARY</div>
            <h2 id="template-title">Start with a template</h2>
            <p>Pick a starting point. You can always undo a template switch.</p>
          </div>
          <button class="template-close" aria-label="Close templates" @click="emit('close')"><X :size="20" /></button>
        </header>
        <div class="template-grid">
          <button v-for="preset in templates" :key="preset.id" class="template-card"
            :aria-label="'Use ' + preset.name + ' template'" @click="emit('apply', preset)">
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
</template>
