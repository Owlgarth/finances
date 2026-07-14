import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload, Trash2, FileText, X, Sparkles, Loader2, RotateCw } from 'lucide-react'
import { transactionsApi } from '../../api/client'
import type { ParsedReceipt, Transaction, TransactionAttachment } from '../../types'
import { useExtractionEnabled } from '../../hooks/useDomain'
import { getApiErrorMessage } from '../../utils/errors'
import ExtractionReviewModal from './ExtractionReviewModal'

interface Props {
  transaction: Transaction
}

const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/') && contentType !== 'image/heic'
}

export default function TransactionAttachments({ transaction }: Props) {
  const queryClient = useQueryClient()
  const extractionEnabled = useExtractionEnabled()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<TransactionAttachment | null>(null)
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
    onSuccess: () => { invalidate(); toast.success('Attachment removed') },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to remove')),
  })

  const startExtraction = useMutation({
    mutationFn: (attachmentId: number) => transactionsApi.extractAttachment(transaction.id, attachmentId),
    onSuccess: (_res, attachmentId) => { setPendingId(attachmentId); invalidate() },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to start extraction')),
  })

  // Poll the extraction state while a job is pending.
  const { data: extraction } = useQuery({
    queryKey: ['extraction', transaction.id, pendingId],
    queryFn: () => transactionsApi.getExtraction(transaction.id, pendingId!),
    enabled: pendingId !== null,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 2000 : false),
  })

  useEffect(() => {
    if (!extraction || pendingId === null) return
    if (extraction.status === 'done' && extraction.result) {
      setReview({ attachmentId: pendingId, parsed: extraction.result })
      setPendingId(null)
      invalidate()
    } else if (extraction.status === 'failed') {
      toast.error(extraction.error || 'Extraction failed')
      setPendingId(null)
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraction, pendingId])

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) upload.mutate(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  const isExtracting = (a: TransactionAttachment) => pendingId === a.id || a.extraction_status === 'pending'

  const reviewAttachment = review && attachments.find((a) => a.id === review.attachmentId)

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="h-16 bg-surface-muted rounded-sm animate-pulse" />
      ) : attachments.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative group border border-border rounded-sm overflow-hidden bg-surface-hover aspect-square">
              {isImage(a.content_type) && a.download_url ? (
                <button type="button" onClick={() => setPreview(a)} className="w-full h-full">
                  <img src={a.download_url} alt={a.filename} className="w-full h-full object-cover" />
                </button>
              ) : (
                <a href={a.download_url ?? undefined} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center w-full h-full text-text-muted p-2">
                  <FileText size={20} />
                  <span className="text-[9px] font-mono mt-1 truncate max-w-full">{a.filename}</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => remove.mutate(a.id)}
                className="absolute top-1 right-1 bg-surface/90 border border-border rounded-sm p-1 text-text-muted hover:text-negative opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove attachment"
              >
                <Trash2 size={12} />
              </button>

              {extractionEnabled && (
                <div className="absolute bottom-1 left-1 right-1">
                  {isExtracting(a) ? (
                    <span className="flex items-center justify-center gap-1 bg-surface/90 border border-border rounded-sm py-1 text-[10px] font-mono text-text-muted">
                      <Loader2 size={11} className="animate-spin" /> Extracting…
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startExtraction.mutate(a.id)}
                      className="flex items-center justify-center gap-1 w-full bg-surface/90 border border-border rounded-sm py-1 text-[10px] font-mono text-primary hover:bg-surface opacity-0 group-hover:opacity-100 transition-opacity"
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

      {preview && preview.download_url && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-scrim backdrop-blur-sm" onClick={() => setPreview(null)}>
          <button type="button" onClick={() => setPreview(null)} className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Close preview">
            <X size={24} />
          </button>
          <img src={preview.download_url} alt={preview.filename} className="max-w-full max-h-[90vh] object-contain rounded-sm" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {reviewAttachment && review && (
        <ExtractionReviewModal
          open
          onClose={() => setReview(null)}
          transaction={transaction}
          parsed={review.parsed}
        />
      )}
    </div>
  )
}
