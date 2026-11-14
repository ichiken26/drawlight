import type { Ref } from 'vue'
import type { Diagram, Workspace } from '../utils/model'
import { parseDiagram, parseWorkspace } from '../utils/model'
import { sequenceBottom } from '../utils/diagramSemantics'
import { toMermaid } from '../utils/mermaid'

interface DiagramFileIO {
  diagram: Ref<Diagram>
  workspace: Ref<Workspace>
  stage: Ref<SVGSVGElement | null>
  exportOpen: Ref<boolean>
  notify: (message: string) => void
  onImport: (diagram: Diagram) => Promise<void>
  onImportWorkspace: (workspace: Workspace) => Promise<void>
}

function filename(diagram: Diagram) {
  return diagram.title.trim().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'diagram'
}

function download(name: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Browser-only import/export boundary.
 * Internal Drawlight JSON is lossless; Mermaid intentionally omits canvas coordinates.
 */
export function useDiagramFileIO(options: DiagramFileIO) {
  const { diagram, workspace, stage, exportOpen, notify, onImport, onImportWorkspace } = options
  function close() { exportOpen.value = false }
  function exportMermaid() {
    download(filename(diagram.value) + '.mmd', toMermaid(diagram.value, workspace.value), 'text/plain')
    close()
    notify('Mermaid exported')
  }
  async function copyMermaid() {
    const content = toMermaid(diagram.value, workspace.value)
    try {
      await navigator.clipboard.writeText(content)
      notify('Mermaid copied!')
    } catch {
      download(filename(diagram.value) + '.mmd', content, 'text/plain')
      notify('Downloaded Mermaid instead')
    }
    close()
  }
  function exportJson() {
    download(filename(diagram.value) + '.drawlight.json',
      JSON.stringify(diagram.value, null, 2), 'application/json')
    close()
    notify('Drawlight JSON exported')
  }
  function exportWorkspace() {
    const page = workspace.value.pages.find(p => p.id === workspace.value.activeId)
    if (page) page.diagram = JSON.parse(JSON.stringify(diagram.value))
    download('drawlight-workspace.json', JSON.stringify(workspace.value, null, 2), 'application/json')
    close()
    notify('Workspace exported')
  }
  function exportSvg() {
    if (!stage.value || diagram.value.nodes.length === 0) {
      notify('Add a shape first')
      return
    }
    const svg = stage.value.cloneNode(true) as SVGSVGElement
    const nodes = diagram.value.nodes
    const minX = Math.min(...nodes.map(n => n.x)) - 48
    const minY = Math.min(...nodes.map(n => n.y)) - 48
    const maxX = Math.max(...nodes.map(n => n.x + n.w)) + 48
    const maxY = Math.max(...nodes.map(n => n.y + n.h),
      diagram.value.kind === 'sequence' ? sequenceBottom(diagram.value) : 0) + 48
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`)
    svg.setAttribute('width', String(maxX - minX))
    svg.setAttribute('height', String(maxY - minY))
    svg.querySelector('#diagram-layer')?.setAttribute('transform', '')
    svg.querySelector('.grid-canvas')?.remove()
    svg.querySelectorAll('.node-port, .selection-outline, .link-guide, .edge-hit')
      .forEach(element => element.remove())
    download(filename(diagram.value) + '.svg',
      new XMLSerializer().serializeToString(svg), 'image/svg+xml')
    close()
    notify('SVG exported')
  }
  async function importJson(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (file.size > 2_000_000) {
      notify('File is too large')
      return
    }
    try {
      const value = JSON.parse(await file.text())
      if (value?.format === 'drawlight-workspace') {
        await onImportWorkspace(parseWorkspace(value))
        notify('Workspace imported')
      } else {
        await onImport(parseDiagram(value))
        notify('Diagram imported')
      }
    } catch {
      notify('Invalid Drawlight JSON')
    }
  }
  return { exportMermaid, copyMermaid, exportJson, exportWorkspace, exportSvg, importJson }
}
