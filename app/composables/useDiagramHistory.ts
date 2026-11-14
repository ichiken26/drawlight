import { ref, type Ref } from 'vue'
import { parseDiagram, type Diagram } from '../utils/model'

const HISTORY_LIMIT = 80

/** Undo/redo knows only document snapshots; it does not handle DOM or persistence. */
export function useDiagramHistory(
  diagram: Ref<Diagram>,
  onCommitted: () => void,
  clearSelection: () => void
) {
  const undoStack = ref<string[]>([])
  const redoStack = ref<string[]>([])

  const snapshot = () => JSON.stringify(diagram.value)

  function checkpoint(before: string) {
    if (snapshot() === before) return
    undoStack.value.push(before)
    if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
    redoStack.value = []
    onCommitted()
  }

  function restore(source: string[], destination: string[]) {
    const previous = source.pop()
    if (!previous) return
    destination.push(snapshot())
    diagram.value = parseDiagram(JSON.parse(previous))
    clearSelection()
    onCommitted()
  }

  function undo() { restore(undoStack.value, redoStack.value) }
  function redo() { restore(redoStack.value, undoStack.value) }
  function clearHistory() {
    undoStack.value = []
    redoStack.value = []
  }

  return { undoStack, redoStack, snapshot, checkpoint, undo, redo, clearHistory }
}
