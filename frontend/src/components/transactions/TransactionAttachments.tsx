import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Upload, Trash2, FileText, X, Sparkles, Loader2, RotateCw, CloudOff, Download } from 'lucide-react'
import { transactionsApi } from '../../api/client'
import type { ParsedReceipt, Transaction, TransactionAttachment } from '../../types'
import { useExtractionConfig } from '../../hooks/useDomain'
import { useOverlay } from '../../hooks/useOverlay'
import { secondaryButtonClass } from '../common/formStyles'
import { getApiErrorMessage } from '../../utils/errors'
import ExtractionReviewModal from './ExtractionReviewModal'

interface Props {
  transaction: Transaction
}

const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/') && contentType !== 'image/heic'
}

// Blob error response bodies are Blobs, never parsed JSON, so
// getApiErrorMessage's `response.data.detail` read finds nothing. Branch on
// the HTTP status instead, then fall through to the generic helper.
function downloadErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) return 'This receipt is no longer available on the server.'
    if (error.response?.status === 503) return 'File storage is temporarily unavailable.'
  }
  return getApiErrorMessage(error, 'Failed to download receipt')
}

// Programmatic <a download> click (ProfilePage.handleExportData precedent).
// Deliberately does NOT revoke the URL: ownership stays with the caller.
// The lightbox passes a URL owned by the query cache (must never be revoked
// here - revoking would poison the thumbnail once the lightbox closes); the
// non-image tile path creates and revokes its own short-lived URL around the
// call. Do not "simplify" this into a helper that always revokes.
function triggerBrowserDownload(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Blob object-URL cache key, shared by the tile query and the delete cleanup.
const attachmentBlobKey = (transactionId: number, attachmentId: number) =>
  ['attachment-blob', transactionId, attachmentId] as const

// Media area of one tile. Owns the per-attachment blob query so hooks live in
// a component, not in the parent's map callback. Fills the parent's
// aspect-square cell.
function AttachmentMedia({
  transactionId,
  attachment,
  downloading,
  onPreview,
  onDownload,
}: {
  transactionId: number
  attachment: TransactionAttachment
  downloading: boolean
  onPreview: (preview: { attachment: TransactionAttachment; url: string }) => void
  onDownload: (attachment: TransactionAttachment) => void
}) {
  const image = isImage(attachment.content_type)
  const blobQuery = useQuery({
    queryKey: attachmentBlobKey(transactionId, attachment.id),
    queryFn: async () => {
      const blob = await transactionsApi.downloadAttachment(transactionId, attachment.id)
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
    enabled: image,
  })

  if (image) {
    // Loading: in-grid tile-shaped skeleton (patterns.md SS3 - skeleton
    // approximates the real content shape; the wrapper supplies the
    // aspect-square tile, border and clipping).
    if (blobQuery.isPending) {
      return <div className="w-full h-full bg-surface-muted animate-pulse" aria-hidden="true" />
    }
    // Error: degrade to the non-image presentation; click retries the fetch.
    if (blobQuery.isError) {
      return (
        <button
          type="button"
          onClick={() => blobQuery.refetch()}
          disabled={blobQuery.isFetching}
          aria-label={`Retry loading ${attachment.filename}`}
          className="flex flex-col items-center justify-center w-full h-full text-text-muted p-2 hover:text-text transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed"
        >
          {blobQuery.isFetching ? <Loader2 size={20} className="animate-spin" /> : <FileText size={20} />}
          <span className="text-[10px] font-mono mt-1 truncate max-w-full">{attachment.filename}</span>
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={() => blobQuery.data && onPreview({ attachment, url: blobQuery.data })}
        // Inset focus ring: a positive outline offset is clipped by the
        // tile wrapper's overflow-hidden (full-bleed button).
        className="w-full h-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus"
      >
        <img src={blobQuery.data} alt={attachment.filename} className="w-full h-full object-cover" />
      </button>
    )
  }

  // Non-image tile (PDF/HEIC): the browser cannot render these inline from
  // an authenticated endpoint, so click downloads via blob.
  return (
    <button
      type="button"
      onClick={() => onDownload(attachment)}
      disabled={downloading}
      aria-label={`Download ${attachment.filename}`}
      className="flex flex-col items-center justify-center w-full h-full text-text-muted p-2 hover:text-text transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed"
    >
      {downloading ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span className="text-[10px] font-mono mt-1">Downloading…</span>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1">
            <FileText size={20} />
            <Download size={14} strokeWidth={1.5} />
          </span>
          <span className="text-[10px] font-mono mt-1 truncate max-w-full">{attachment.filename}</span>
        </>
      )}
    </button>
  )
}

export default function TransactionAttachments({ transaction }: Props) {
  const queryClient = useQueryClient()
  const { enabled: extractionEnabled, reachable: extractionReachable } = useExtractionConfig()
  const fileRef = useRef<HTMLInputElement>(null)
  // The lightbox reuses the thumbnail's cached object URL (passed from the
  // tile click) instead of refetching - the blob query cache owns that URL.
  const [preview, setPreview] = useState<{ attachment: TransactionAttachment; url: string } | null>(null)
  // Stack-aware Escape, scroll lock, focus capture/restore for the lightbox
  // (R1). Without this, Escape inside TransactionFormModal closed the form
  // modal underneath because the lightbox never joined the overlay stack.
  const lightboxRef = useOverlay(preview !== null, () => setPreview(null))
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [review, setReview] = useState<{ attachmentId: number; parsed: ParsedReceipt } | null>(null)

  const attachmentsKey = ['transaction-attachments', transaction.id]
  const { data: attachments = [], isLoading } = useQuery({
    queryKey: attachmentsKey,
    queryFn: () => transactionsApi.listAttachments(transaction.id),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: attachmentsKey })

  const upload = useMutation({
    mutationFn: (file: File) => transactionsApi.uploadAttachment(transaction.id, file),
    onSuccess: () => { invalidate(); toast.success('Attachment added') },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to upload')),
  })

  const remove = useMutation({
    mutationFn: (attachmentId: number) => transactionsApi.deleteAttachment(transaction.id, attachmentId),
    onSuccess: (_res, attachmentId) => {
      invalidate()
      // The attachment can never be shown again; drop its blob cache entry
      // now. The object URL itself is reclaimed at document unload - bounded
      // by the per-transaction attachment caps.
      queryClient.removeQueries({ queryKey: attachmentBlobKey(transaction.id, attachmentId) })
      toast.success('Attachment removed')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to remove')),
  })

  // Click-to-download for non-image tiles (PDF/HEIC). Creates and revokes
  // its OWN short-lived URL around the anchor click; the lightbox path
  // reuses the query-cached URL and never revokes (R4).
  const downloadFile = useMutation({
    mutationFn: async (a: TransactionAttachment) => {
      const blob = await transactionsApi.downloadAttachment(transaction.id, a.id)
      const url = URL.createObjectURL(blob)
      triggerBrowserDownload(url, a.filename)
      URL.revokeObjectURL(url)
    },
    onSuccess: () => toast.success('Receipt downloaded'),
    onError: (error) => toast.error(downloadErrorMessage(error)),
  })

  const startExtraction = useMutation({
    mutationFn: (attachmentId: number) => transactionsApi.extractAttachment(transaction.id, attachmentId),
    onSuccess: (_res, attachmentId) => { setPendingId(attachmentId); invalidate() },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to start extraction')),
  })

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
    queryKey: ['extraction', transaction.id, activePendingId],
    queryFn: () => transactionsApi.getExtraction(transaction.id, activePendingId!),
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
      toast.error(extraction.error || 'Extraction failed')
      setPendingId(null)
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraction, activePendingId])

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) upload.mutate(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDownloadFromLightbox = () => {
    if (!preview) return
    // Cached object URL owned by the blob query - NOT revoked here and no
    // refetch happens (the thumbnail already loaded it), so this is a
    // synchronous anchor click with no failure path.
    triggerBrowserDownload(preview.url, preview.attachment.filename)
    toast.success('Receipt downloaded')
  }

  const isExtracting = (a: TransactionAttachment) =>
    pendingId === a.id ||
    a.extraction_status === 'pending' ||
    // Cover the click → mutation.onSuccess gap so the user sees immediate
    // feedback (and the button disappears, preventing double-clicks that
    // queue redundant extraction jobs).
    (startExtraction.isPending && startExtraction.variables === a.id)

  const reviewAttachment = review && attachments.find((a) => a.id === review.attachmentId)

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="h-16 bg-surface-muted rounded-sm animate-pulse" />
      ) : attachments.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative group border border-border rounded-sm overflow-hidden bg-surface-hover aspect-square">
              <AttachmentMedia
                transactionId={transaction.id}
                attachment={a}
                downloading={downloadFile.isPending && downloadFile.variables?.id === a.id}
                onPreview={setPreview}
                onDownload={(att) => downloadFile.mutate(att)}
              />

              <button
                type="button"
                onClick={() => remove.mutate(a.id)}
                className="!absolute top-1 right-1 bg-surface/90 border border-border rounded-sm p-1 text-text-muted hover:text-negative opacity-0 group-hover:opacity-100 touch-reveal touch-hit transition-opacity"
                aria-label="Remove attachment"
              >
                <Trash2 size={12} />
              </button>

              {extractionEnabled && (
                <div className="absolute bottom-1 left-1 right-1">
                  {isExtracting(a) ? (
                    <span className="flex items-center justify-center gap-1 bg-surface/90 border border-border rounded-sm py-1 text-[10px] font-mono text-text-muted">
                      {extractionReachable ? (
                        <><Loader2 size={11} className="animate-spin" /> Extracting…</>
                      ) : (
                        <><CloudOff size={11} /> Queued</>
                      )}
                    </span>
                  ) : (
                    // Unlike the synchronous "From receipt" flow, this queues work:
                    // the worker retries until the scanner is back, so it stays
                    // clickable while offline.
                    <button
                      type="button"
                      onClick={() => startExtraction.mutate(a.id)}
                      title={extractionReachable ? undefined : 'The scanner is offline — this will run when it is back'}
                      className="flex items-center justify-center gap-1 w-full bg-surface/90 border border-border rounded-sm py-1 text-[10px] font-mono text-primary hover:bg-surface opacity-0 group-hover:opacity-100 touch-reveal transition-opacity"
                    >
                      {a.extraction_status === 'failed' ? <RotateCw size={11} /> : <Sparkles size={11} />}
                      {a.extraction_status === 'failed' ? 'Retry' : 'Extract items'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted">No receipts attached.</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={upload.isPending}
        className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors disabled:opacity-50 inline-flex items-center gap-1"
      >
        <Upload size={13} /> {upload.isPending ? 'Uploading…' : 'Add receipt'}
      </button>

      {preview && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-scrim backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          {/* Hand-rolled fullscreen presentation is intentional: the design
              system has no lightbox component and Modal's panel chrome would
              be wrong - but the overlay RULES apply (useOverlay: stack-aware
              Escape over the enclosing TransactionFormModal/BottomSheet,
              scroll lock, focus capture/restore). */}
          <div
            ref={lightboxRef}
            role="dialog"
            aria-modal="true"
            aria-label={preview.attachment.filename}
            tabIndex={-1}
            className="relative flex flex-col items-center gap-3 outline-none max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header row convention: actions right, Close far right. */}
            <div className="flex items-center gap-2 self-end">
              <button
                type="button"
                onClick={handleDownloadFromLightbox}
                className={`${secondaryButtonClass} inline-flex items-center gap-1.5`}
              >
                <Download size={14} strokeWidth={1.5} /> Download
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close preview"
                className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] text-white/80 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus rounded-sm"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            {/* Height budget: wrapper p-4 (2rem) + header row (32px, 44px on
                touch) + gap-3 leaves ~6rem of chrome; calc form matches
                MainLayout's arbitrary-calc precedent. */}
            <img
              src={preview.url}
              alt={preview.attachment.filename}
              className="max-w-full max-h-[calc(100dvh-6rem)] object-contain rounded-sm"
            />
          </div>
        </div>
      )}

      {reviewAttachment && review && (
        <ExtractionReviewModal
          onClose={() => setReview(null)}
          transaction={transaction}
          parsed={review.parsed}
        />
      )}
    </div>
  )
}
