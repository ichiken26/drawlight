<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus, X, Trash2, Save } from 'lucide-vue-next'
import type { FunctionDefinition, FunctionParameter } from '../utils/model'

const props = defineProps<{ functions: readonly FunctionDefinition[] }>()
const emit = defineEmits<{
  create: []
  update: [fn: FunctionDefinition]
  remove: [id: string]
  close: []
}>()
const selectedId = ref<string | null>(null)
const name = ref('')
const inputs = ref('')
const outputs = ref('')
const error = ref('')
const selected = computed(() => props.functions.find(fn => fn.id === selectedId.value))
function format(list: readonly FunctionParameter[]) {
  return list.map(entry => entry.name + ': ' + entry.type).join('\n')
}
function choose(fn: FunctionDefinition) {
  selectedId.value = fn.id
  name.value = fn.name
  inputs.value = format(fn.inputs)
  outputs.value = format(fn.outputs)
  error.value = ''
}
watch(() => props.functions.length, () => {
  const current = props.functions.find(fn => fn.id === selectedId.value)
  if (!current && props.functions.length) choose(props.functions.at(-1)!)
  if (!props.functions.length) selectedId.value = null
}, { immediate: true })
function parseParams(text: string): FunctionParameter[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length > 20) throw new Error('Maximum 20 fields')
  return lines.map(line => {
    const parts = /^([\w-]{1,80})\s*:\s*(.{1,80})$/.exec(line)
    if (!parts) throw new Error('Use name: type for each parameter')
    return { name: parts[1]!, type: parts[2]!.trim() }
  })
}
function save() {
  if (!selected.value) return
  try {
    if (!name.value.trim() || name.value.length > 100) throw new Error('Function name is required')
    const fn: FunctionDefinition = {
      id: selected.value.id, name: name.value.trim(),
      inputs: parseParams(inputs.value), outputs: parseParams(outputs.value)
    }
    emit('update', fn); error.value = ''
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Invalid function' }
}
</script>

<template>
  <div class="template-overlay" @click.self="emit('close')">
    <section class="catalog-dialog" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
      <header class="template-dialog-header">
        <div><div class="template-eyebrow">SHARED DEFINITIONS</div><h2 id="catalog-title">Function catalog</h2>
          <p>Define typed inputs and outputs once. Reference them from any diagram using Tab.</p></div>
        <button class="template-close" aria-label="Close catalog" @click="emit('close')"><X :size="20" /></button>
      </header>
      <div class="catalog-layout">
        <aside class="catalog-list">
          <button v-for="fn in functions" :key="fn.id" :class="{ selected: fn.id === selectedId }"
            @click="choose(fn)">{{ fn.name }}</button>
          <button class="catalog-add" @click="emit('create')"><Plus :size="15" /> Add function</button>
        </aside>
        <section v-if="selected" class="catalog-editor">
          <label class="field-label">Function name</label>
          <input v-model="name" class="property-input" aria-label="Function name" maxlength="100" />
          <label class="field-label">Inputs · one name: type per line</label>
          <textarea v-model="inputs" class="property-input" rows="5" aria-label="Function inputs"></textarea>
          <label class="field-label">Outputs · one name: type per line</label>
          <textarea v-model="outputs" class="property-input" rows="5" aria-label="Function outputs"></textarea>
          <p v-if="error" class="catalog-error">{{ error }}</p>
          <div class="catalog-buttons">
            <button class="danger-button" @click="emit('remove', selected.id)"><Trash2 :size="14" /> Delete</button>
            <button class="button primary" @click="save"><Save :size="15" /> Save definition</button>
          </div>
        </section>
        <section v-else class="catalog-empty">Click <strong>Add function</strong> to define inputs and outputs.</section>
      </div>
    </section>
  </div>
</template>
