import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { transactionsApi } from '../api/client'
import type { TransactionAttachment } from '../types'
import { attachmentDownloadErrorMessage, triggerBrowserDownload } from '../utils/attachments'
import { getApiErrorMessage } from '../utils/errors'

/** Query key for one transaction's attachment list. */
export const transactionAttachmentsKey = (transactionId: number) =>
  ['transaction-attachments', transactionId] as const

/** Query key for one attachment's cached blob object URL. */
export const attachmentBlobKey = (transactionId: number, attachmentId: number) =>
  ['attachment-blob', transactionId, attachmentId] as const

/** Attachment list for one transaction. */
export function useTransactionAttachments(transactionId: number) {
  return useQuery({
    queryKey: transactionAttachmentsKey(transactionId),
    queryFn: () => transactionsApi.listAttachments(transactionId),
  })
}

/** Upload a receipt file to the transaction; refreshes the list on success. */
export function useUploadAttachment(transactionId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => transactionsApi.uploadAttachment(transactionId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionAttachmentsKey(transactionId) })
      toast.success('Attachment added')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to upload')),
  })
}

/**
 * Delete an attachment; refreshes the list and drops the deleted file's
 * cached blob entry on success.
 */
export function useDeleteAttachment(transactionId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (attachmentId: number) => transactionsApi.deleteAttachment(transactionId, attachmentId),
    onSuccess: (_res, attachmentId) => {
      queryClient.invalidateQueries({ queryKey: transactionAttachmentsKey(transactionId) })
      // The attachment can never be shown again; drop its blob cache entry
      // now. The object URL itself is reclaimed at document unload - bounded
      // by the per-transaction attachment caps.
      queryClient.removeQueries({ queryKey: attachmentBlobKey(transactionId, attachmentId) })
      toast.success('Attachment removed')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to remove')),
  })
}

/**
 * Cached object URL for one attachment's bytes. The query mints the URL and
 * pins it in the cache; consumers must never revoke it.
 */
export function useAttachmentBlob(transactionId: number, attachmentId: number, enabled = true) {
  return useQuery({
    queryKey: attachmentBlobKey(transactionId, attachmentId),
    queryFn: async () => {
      const blob = await transactionsApi.downloadAttachment(transactionId, attachmentId)
      return URL.createObjectURL(blob)
    },
    // Files are immutable (storage keys are uuid-hex) so they are never
    // stale. gcTime: Infinity is load-bearing: with the default 5-min gc a
    // dropped cache entry leaks its object URL and a remount mints a second
    // one for the same bytes.
    staleTime: Infinity,
    gcTime: Infinity,
    // Immutable files: automatic retries would only delay the retry-tile
    // fallback. Retry is the explicit tile click.
    retry: false,
    enabled,
  })
}

/**
 * Download an attachment to disk. Fetches the blob and downloads it via a
 * short-lived object URL that this mutation creates and revokes itself; the
 * lightbox download path instead reuses the query-cached URL and never
 * revokes.
 */
export function useAttachmentDownload(transactionId: number) {
  return useMutation({
    mutationFn: async (a: TransactionAttachment) => {
      const blob = await transactionsApi.downloadAttachment(transactionId, a.id)
      const url = URL.createObjectURL(blob)
      triggerBrowserDownload(url, a.filename)
      URL.revokeObjectURL(url)
    },
    onSuccess: () => toast.success('Receipt downloaded'),
    onError: (error) => toast.error(attachmentDownloadErrorMessage(error)),
  })
}
