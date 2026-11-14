import { normalizeDiagram } from '../../shared/document.mjs'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.public.syncEnabled) {
    throw createError({ statusCode: 404, statusMessage: 'Sync disabled' })
  }
  try {
    const document = normalizeDiagram(await readBody(event))
    return await $fetch(`${config.gleamApiUrl}/diagram`, { method: 'PUT', body: document })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid Drawlight document:')) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    throw error
  }
})
