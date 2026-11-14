<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { completionPrefix, insertCompletion } from '../../shared/references.mjs'
import type { ReferenceOption } from '../../shared/references.mjs'

const props = defineProps<{
  modelValue: string
  suggestions: readonly ReferenceOption[]
  placeholder?: string
}>()
const emit = defineEmits<{ commit: [value: string] }>()
const input = ref<HTMLInputElement | null>(null)
const draft = ref(props.modelValue)
const caret = ref(0)
const open = ref(false)
const selected = ref(0)
watch(() => props.modelValue, value => { draft.value = value; open.value = false })
const matches = computed(() => {
  if (!open.value) return []
  const p = completionPrefix(draft.value, caret.value)
  if (!p.triggered) return []
  return props.suggestions.filter(item => item.label.toLowerCase().includes(p.query)).slice(0, 8)
})
function changed() {
  caret.value = input.value?.selectionStart ?? draft.value.length
  selected.value = 0
  open.value = true
}
function commit() {
  open.value = false
  if (draft.value !== props.modelValue) emit('commit', draft.value)
}
function complete(option: ReferenceOption) {
  const next = insertCompletion(draft.value, caret.value, option)
  draft.value = next.value
  caret.value = next.cursor
  open.value = false
  emit('commit', draft.value)
  nextTick(() => { input.value?.focus(); input.value?.setSelectionRange(next.cursor, next.cursor) })
}
function keydown(event: KeyboardEvent) {
  if (open.value && matches.value.length) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      selected.value = (selected.value + (event.key === 'ArrowDown' ? 1 : -1) + matches.value.length) % matches.value.length
      return
    }
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault()
      complete(matches.value[selected.value]!)
      return
    }
  }
  if (event.key === 'Escape') { open.value = false; return }
  if (event.key === 'Enter') { event.preventDefault(); commit(); input.value?.blur() }
}
</script>

<template>
  <div class="completion-field">
    <input id="edge-label-editor" ref="input" class="property-input" :value="draft"
      maxlength="200" :placeholder="placeholder || 'e.g. HTTP, @users.email'"
      autocomplete="off" aria-label="Connection label"
      @input="draft = ($event.target as HTMLInputElement).value; changed()"
      @click="caret = input?.selectionStart ?? 0" @keydown="keydown"
      @blur="commit" />
    <div v-if="matches.length" class="completion-menu" role="listbox" aria-label="Reference suggestions">
      <button v-for="(item, index) in matches" :key="item.key" type="button" role="option"
        :aria-selected="index === selected" :class="{ active: selected === index }"
        @mousedown.prevent="complete(item)">
        <span class="completion-label">{{ item.label }}</span>
        <span class="completion-detail">{{ item.detail }}</span>
      </button>
      <div class="completion-hint">Tab / Enter to insert linked reference</div>
    </div>
    <p class="field-hint">Type <kbd>@</kbd> or a name, then <kbd>Tab</kbd>. Linked references follow definition changes.</p>
  </div>
</template>
