import type { Workspace, FunctionDefinition } from '../app/utils/model'
export type ReferenceOption = { key: string; token: string; label: string; detail: string; kind: 'field' | 'function' }
export function functionSignature(fn: FunctionDefinition): string
export function referenceOptions(workspace: Workspace): ReferenceOption[]
export function resolveReferences(value: string, workspace?: Workspace): string
export function completionPrefix(value: string, cursor: number): { query: string; start: number; triggered: boolean }
export function filterCompletions(workspace: Workspace, value: string, cursor: number): ReferenceOption[]
export function insertCompletion(value: string, cursor: number, option: ReferenceOption): { value: string; cursor: number }
