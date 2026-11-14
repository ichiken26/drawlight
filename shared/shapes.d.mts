import type { NodeKind, DiagramNode } from '../app/utils/model'
export const palette: readonly [string, string, string, string, string]
export const shapeDefaults: Record<NodeKind, { readonly w: number; readonly h: number; readonly label: string; readonly color: string }>
export function createShape(id: string, kind: NodeKind, label: string, x: number, y: number): DiagramNode
