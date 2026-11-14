import type { DiagramNode } from './model'

// All values use diagram-space coordinates, not screen pixels.
// A separately built Rust/Wasm module may replace these hot-path operations.
type WasmGeometry = {
  snap_to_grid(value: number, grid: number): number
  orthogonal_path(sx: number, sy: number, tx: number, ty: number): string
}
let wasm: WasmGeometry | null = null
export async function initGeometry(baseURL = '/'): Promise<boolean> {
  try {
    const moduleURL = new URL(`${baseURL.replace(/\/$/, '')}/geometry/drawlight_geometry.js`, location.origin).href
    const mod = await import(/* @vite-ignore */ moduleURL)
    await mod.default()
    wasm = mod as WasmGeometry
    return true
  } catch {
    wasm = null
    return false
  }
}
export function snap(value: number, grid = 16): number {
  return wasm ? wasm.snap_to_grid(value, grid) : Math.round(value / grid) * grid
}
export function pathBetween(from: DiagramNode, to: DiagramNode): string {
  const cx = from.x + from.w / 2
  const cy = from.y + from.h / 2
  const tx = to.x + to.w / 2
  const ty = to.y + to.h / 2
  const horizontal = Math.abs(tx - cx) > Math.abs(ty - cy)
  const sx = horizontal ? cx + Math.sign(tx - cx) * from.w / 2 : cx
  const sy = horizontal ? cy : cy + Math.sign(ty - cy) * from.h / 2
  const ex = horizontal ? tx - Math.sign(tx - cx) * to.w / 2 : tx
  const ey = horizontal ? ty : ty - Math.sign(ty - cy) * to.h / 2
  if (wasm) return wasm.orthogonal_path(sx, sy, ex, ey)
  return orthogonalPath(sx, sy, ex, ey)
}
export function orthogonalPath(sx: number, sy: number, tx: number, ty: number): string {
  if (Math.abs(tx - sx) >= Math.abs(ty - sy)) {
    const mid = (sx + tx) / 2
    return `M ${sx} ${sy} L ${mid} ${sy} L ${mid} ${ty} L ${tx} ${ty}`
  }
  const mid = (sy + ty) / 2
  return `M ${sx} ${sy} L ${sx} ${mid} L ${tx} ${mid} L ${tx} ${ty}`
}
