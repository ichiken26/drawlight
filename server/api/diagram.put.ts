export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.public.syncEnabled) throw createError({ statusCode: 404, statusMessage: 'Sync disabled' })
  const body = await readBody(event)
  // This is a local PoC proxy only. The public static build has no write route.
  if (!body || body.version !== 1 || !Array.isArray(body.nodes) || !Array.isArray(body.edges)
    || body.nodes.length > 1000 || body.edges.length > 2000) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid diagram' })
  }
  return await $fetch(`${config.gleamApiUrl}/diagram`, { method: 'PUT', body })
})
