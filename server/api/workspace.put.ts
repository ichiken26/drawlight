import { normalizeWorkspace } from '../../shared/workspace.mjs'

export default defineEventHandler(async event => {
  const config = useRuntimeConfig()
  if (!config.public.syncEnabled) throw createError({ statusCode: 404, statusMessage: 'Sync disabled' })
  let workspace
  try { workspace = normalizeWorkspace(await readBody(event)) }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid workspace' })
  }
  return await $fetch(`${config.gleamApiUrl}/workspace`, { method: 'PUT', body: workspace })
})
