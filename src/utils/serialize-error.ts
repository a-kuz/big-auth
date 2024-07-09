export const serializeError = async () => (await import('serialize-error')).serializeError
export const writeErrorLog = async (error: any) => console.error(
  (await serializeError())(error)
)
