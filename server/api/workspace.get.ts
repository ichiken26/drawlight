import { normalizeWorkspace } from '../../shared/workspace.mjs'
import type { Workspace } from '../../app/utils/model'

export default defineEventHandler(async (): Promise<Workspace> => {
  const config = useRuntimeConfig()
  if (!config.public.syncEnabled) throw createError({ statusCode: 404, statusMessage: 'Sync disabled' })
  const data: unknown = await $fetch<unknown>(`${config.gleamApiUrl}/workspace`)
  return normalizeWorkspace(data)
})
