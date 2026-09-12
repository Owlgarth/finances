import axios from 'axios'
import toast from 'react-hot-toast'
import { triggerBrowserDownload } from './attachments'

/**
 * One blob-export run: the blob fetch plus every user-facing string,
 * pre-translated by the caller. The pages sharing this flow live in
 * different translation namespaces (transactions, planned, settings), so this
 * helper must NOT own translation keys.
 */
export interface BlobExportOptions {
  /** File name offered to the browser's save dialog. */
  filename: string
  /** Toast shown once the file is handed to the browser. */
  successMessage: string
  /** Toast shown when the request fails and the error body yields no detail. */
  errorMessage: string
  /**
   * Toast shown while the request runs. Omit for no loading toast (the
   * profile data export ships without one).
   */
  loadingMessage?: string
}

// Error bodies of responseType: 'blob' requests arrive as Blobs, never
// parsed JSON (same class as attachmentDownloadErrorMessage in
// utils/attachments.ts). Try to read the server's detail out of the blob
// text before falling back to the caller's message.
async function blobExportErrorMessage(error: unknown, fallback: string): Promise<string> {
  const data = axios.isAxiosError(error) ? error.response?.data : undefined
  if (data instanceof Blob) {
    try {
      const parsed: unknown = JSON.parse(await data.text())
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'detail' in parsed &&
        typeof parsed.detail === 'string' &&
        parsed.detail !== ''
      ) {
        return parsed.detail
      }
    } catch {
      // Error body is not JSON - the caller's fallback message applies.
    }
  }
  return fallback
}

/**
 * Shared download-and-save flow for the JSON export buttons (transactions
 * view export, planned view export, profile data export): optional loading
 * toast, blob fetch, short-lived object URL handed to
 * triggerBrowserDownload, success toast, and a status-aware error toast
 * (server detail parsed out of the blob error body when possible, the
 * caller's fallback otherwise).
 *
 * Never throws: every failure is toasted here. Callers keep only their
 * isExporting state around the call.
 */
export async function runBlobExport(
  fetchBlob: () => Promise<Blob>,
  { filename, successMessage, errorMessage, loadingMessage }: BlobExportOptions,
): Promise<void> {
  const toastId = loadingMessage !== undefined ? toast.loading(loadingMessage) : undefined
  try {
    const blob = await fetchBlob()
    const url = URL.createObjectURL(blob)
    triggerBrowserDownload(url, filename)
    URL.revokeObjectURL(url)
    if (toastId !== undefined) {
      toast.success(successMessage, { id: toastId })
    } else {
      toast.success(successMessage)
    }
  } catch (error: unknown) {
    const message = await blobExportErrorMessage(error, errorMessage)
    if (toastId !== undefined) {
      toast.error(message, { id: toastId })
    } else {
      toast.error(message)
    }
  }
}
