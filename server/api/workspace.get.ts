import { normalizeWorkspace } from '../../shared/workspace.mjs'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  if (!config.public.syncEnabled) throw createError({ statusCode: 404, statusMessage: 'Sync disabled' })
  const data = await $fetch<unknown>(`${config.gleamApiUrl}/workspace`)
  return normalizeWorkspace(data)
})
