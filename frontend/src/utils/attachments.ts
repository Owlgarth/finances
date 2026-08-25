import axios from 'axios'
import { getApiErrorMessage } from './errors'

/**
 * Whether the browser can render this content type inline as an image.
 * HEIC is excluded: browsers cannot render it inline, so HEIC tiles take
 * the download path instead.
 */
export function isImage(contentType: string): boolean {
  return contentType.startsWith('image/') && contentType !== 'image/heic'
}

// Blob error response bodies are Blobs, never parsed JSON, so
// getApiErrorMessage's `response.data.detail` read finds nothing. Branch on
// the HTTP status instead, then fall through to the generic helper.
export function attachmentDownloadErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) return 'This receipt is no longer available on the server.'
    if (error.response?.status === 503) return 'File storage is temporarily unavailable.'
  }
  return getApiErrorMessage(error, 'Failed to download receipt')
}

// Programmatic <a download> click. Deliberately revoke-free: the caller owns
// the URL - the lightbox passes a query-cached URL that must never be revoked
// (revoking it would poison the thumbnail), while the download mutation
// creates and revokes its own short-lived URL around the call. Do not
// "simplify" this into a helper that always revokes.
export function triggerBrowserDownload(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
