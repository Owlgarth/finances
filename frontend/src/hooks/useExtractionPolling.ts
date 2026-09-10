import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { transactionsApi } from '../api/client'
import type { ParsedReceipt, TransactionAttachment } from '../types'
import { transactionAttachmentsKey } from './useAttachments'

export interface UseExtractionPollingOptions {
  /** Transaction whose attachments the poll watches. */
  transactionId: number
  /** The transaction's attachment list, as rendered by the caller. */
  attachments: TransactionAttachment[]
  /** Whether the scanner is answering right now; keys the poll cadence. */
  extractionReachable: boolean
  /** Fallback toast text when a failed extraction carries no error string. */
  extractionFailedMessage: string
}

/**
 * Extraction-state polling for one transaction's attachments: owns the local
 * pending id, the poll query, the done/failed side effects, and the review
 * payload the done branch produces. The caller renders from the returned
 * state and fires extraction jobs from its own mutation, wiring that
 * mutation's onSuccess to the returned setPendingId + invalidate.
 */
export function useExtractionPolling({
  transactionId,
  attachments,
  extractionReachable,
  extractionFailedMessage,
}: UseExtractionPollingOptions) {
  const queryClient = useQueryClient()
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [review, setReview] = useState<{ attachmentId: number; parsed: ParsedReceipt } | null>(null)
  // Extraction runs update the list (status badges on the tiles), so the
  // extraction flow invalidates the list query itself; the attachment hooks
  // invalidate it for their own mutations.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: transactionAttachmentsKey(transactionId) })
  // Poll the extraction state while a job is pending. While the scanner is
  // offline the job can sit queued for hours (the worker retries with backoff),
  // so poll far more slowly rather than hammering the API every 2s.
  // A reload mid-extraction leaves the attachment server-side 'pending' with no
  // local pendingId — nothing would poll and the badge (isExtracting) would be
  // stuck forever. Derive the polled id so server-side pending resumes polling
  // (derived, NOT adopted via effect-setState — keeps the set-state-in-effect
  // lint clean). Local pendingId wins while set (covers the click → onSuccess
  // gap).
  const serverPendingId = attachments.find((a) => a.extraction_status === 'pending')?.id ?? null
  const activePendingId = pendingId ?? serverPendingId

  const { data: extraction } = useQuery({
    queryKey: ['extraction', transactionId, activePendingId],
    queryFn: () => transactionsApi.getExtraction(transactionId, activePendingId!),
    enabled: activePendingId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? (extractionReachable ? 2000 : 30000) : false,
  })

  useEffect(() => {
    if (!extraction || activePendingId === null) return
    if (extraction.status === 'done' && extraction.result) {
      setReview({ attachmentId: activePendingId, parsed: extraction.result })
      setPendingId(null)
      invalidate()
    } else if (extraction.status === 'failed') {
      toast.error(extraction.error || extractionFailedMessage)
      setPendingId(null)
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraction, activePendingId])

  return { pendingId, setPendingId, review, setReview, invalidate }
}
