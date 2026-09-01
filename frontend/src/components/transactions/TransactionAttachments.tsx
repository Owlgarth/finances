import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload, Trash2, FileText, X, Sparkles, Loader2, RotateCw, CloudOff, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { transactionsApi } from '../../api/client'
import type { ParsedReceipt, Transaction, TransactionAttachment } from '../../types'
import {
  transactionAttachmentsKey,
  useAttachmentBlob,
  useAttachmentDownload,
  useDeleteAttachment,
  useTransactionAttachments,
  useUploadAttachment,
} from '../../hooks/useAttachments'
import { useExtractionConfig } from '../../hooks/useDomain'
import { useOverlay } from '../../hooks/useOverlay'
import { secondaryButtonClass } from '../common/formStyles'
import { isImage, triggerBrowserDownload } from '../../utils/attachments'
import { getApiErrorMessage } from '../../utils/errors'
import ExtractionReviewModal from './ExtractionReviewModal'

interface Props {
  transaction: Transaction
}

const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

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
  const { t } = useTranslation('transactions')
  const image = isImage(attachment.content_type)
  // Only image tiles prefetch the blob; non-image tiles download on click.
  const blobQuery = useAttachmentBlob(transactionId, attachment.id, image)

  if (image) {
    // Loading: tile-shaped skeleton that approximates the real content
    // shape; the wrapper supplies the aspect-square tile, border and
    // clipping.
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
          aria-label={t('attachments.retryLoadingAria', { filename: attachment.filename })}
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
      aria-label={t('attachments.downloadAria', { filename: attachment.filename })}
      className="flex flex-col items-center justify-center w-full h-full text-text-muted p-2 hover:text-text transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed"
    >
      {downloading ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span className="text-[10px] font-mono mt-1">{t('attachments.downloading')}</span>
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
  const { t } = useTranslation('transactions')
  const queryClient = useQueryClient()
  const { enabled: extractionEnabled, reachable: extractionReachable } = useExtractionConfig()
  const fileRef = useRef<HTMLInputElement>(null)
  // The lightbox reuses the thumbnail's cached object URL (passed from the
  // tile click) instead of refetching - the blob query cache owns that URL.
  const [preview, setPreview] = useState<{ attachment: TransactionAttachment; url: string } | null>(null)
  // Stack-aware Escape, scroll lock, focus capture/restore for the lightbox.
  // Without this, Escape inside TransactionFormModal closed the form modal
  // underneath because the lightbox never joined the overlay stack.
  const lightboxRef = useOverlay(preview !== null, () => setPreview(null))
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [review, setReview] = useState<{ attachmentId: number; parsed: ParsedReceipt } | null>(null)

  const { data: attachments = [], isLoading } = useTransactionAttachments(transaction.id)
  // Extraction runs update the list (status badges on the tiles), so the
  // extraction flow invalidates the list query itself; the attachment hooks
  // invalidate it for their own mutations.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: transactionAttachmentsKey(transaction.id) })

  const upload = useUploadAttachment(transaction.id)
  const remove = useDeleteAttachment(transaction.id)
  const downloadFile = useAttachmentDownload(transaction.id)

  const startExtraction = useMutation({
    mutationFn: (attachmentId: number) => transactionsApi.extractAttachment(transaction.id, attachmentId),
    onSuccess: (_res, attachmentId) => { setPendingId(attachmentId); invalidate() },
    onError: (error) => toast.error(getApiErrorMessage(error, t('attachments.startExtractionFailed'))),
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
      toast.error(extraction.error || t('attachments.extractionFailed'))
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
    toast.success(t('attachments.downloaded'))
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
                aria-label={t('attachments.removeAria')}
              >
                <Trash2 size={12} />
              </button>

              {extractionEnabled && (
                <div className="absolute bottom-1 left-1 right-1">
                  {isExtracting(a) ? (
                    <span className="flex items-center justify-center gap-1 bg-surface/90 border border-border rounded-sm py-1 text-[10px] font-mono text-text-muted">
                      {extractionReachable ? (
                        <><Loader2 size={11} className="animate-spin" /> {t('attachments.extracting')}</>
                      ) : (
                        <><CloudOff size={11} /> {t('attachments.queued')}</>
                      )}
                    </span>
                  ) : (
                    // Unlike the synchronous "From receipt" flow, this queues work:
                    // the worker retries until the scanner is back, so it stays
                    // clickable while offline.
                    <button
                      type="button"
                      onClick={() => startExtraction.mutate(a.id)}
                      title={extractionReachable ? undefined : t('attachments.scannerOfflineTitle')}
                      className="flex items-center justify-center gap-1 w-full bg-surface/90 border border-border rounded-sm py-1 text-[10px] font-mono text-primary hover:bg-surface opacity-0 group-hover:opacity-100 touch-reveal transition-opacity"
                    >
                      {a.extraction_status === 'failed' ? <RotateCw size={11} /> : <Sparkles size={11} />}
                      {a.extraction_status === 'failed' ? t('attachments.retry') : t('attachments.extractItems')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted">{t('attachments.none')}</p>
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
        <Upload size={13} /> {upload.isPending ? t('attachments.uploading') : t('attachments.addReceipt')}
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
                <Download size={14} strokeWidth={1.5} /> {t('attachments.download')}
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label={t('attachments.closePreviewAria')}
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
