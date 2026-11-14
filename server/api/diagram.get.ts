export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  if (!config.public.syncEnabled) throw createError({ statusCode: 404, statusMessage: 'Sync disabled' })
  return await $fetch(`${config.gleamApiUrl}/diagram`)
})
