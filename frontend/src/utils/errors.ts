import axios from 'axios'

/** One element of a Django Ninja 422 detail array. */
interface NinjaFieldError {
  type?: string
  loc?: Array<string | number>
  msg?: string
}

/**
 * Extract a readable message from an API error. String details pass through
 * unchanged; Django Ninja 422 details arrive as an array of field-error
 * objects, whose msg strings (already translated server-side via
 * Accept-Language) are deduplicated and joined with '; ' into one line.
 * Anything else - missing body, empty array, elements without a msg - falls
 * back to the caller-provided message.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ detail?: string | NinjaFieldError[] }>(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string' && detail !== '') return detail
    if (Array.isArray(detail)) {
      const messages = [
        ...new Set(
          detail
            .map((item) => (typeof item?.msg === 'string' && item.msg !== '' ? item.msg : null))
            .filter((msg): msg is string => msg !== null),
        ),
      ]
      if (messages.length > 0) return messages.join('; ')
    }
  }
  return fallback
}
