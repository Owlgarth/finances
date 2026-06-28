import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { exchangeShortcutsApi } from '../../../api/client'
import type { ExchangeShortcut } from '../../../types'
import Modal from '../../common/Modal'
import Select from '../../common/Select'

const CURRENCIES = ['PLN', 'USD', 'EUR', 'UAH']

interface Props {
  isOpen: boolean
  onClose: () => void
  shortcuts: ExchangeShortcut[]
}

export default function ManageShortcutsModal({ isOpen, onClose, shortcuts }: Props) {
  const queryClient = useQueryClient()
  const [newFrom, setNewFrom] = useState('PLN')
  const [newTo, setNewTo] = useState('USD')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editFrom, setEditFrom] = useState('')
  const [editTo, setEditTo] = useState('')

  const invalidateShortcuts = () => {
    queryClient.invalidateQueries({ queryKey: ['exchange-shortcuts'] })
  }

  const createMutation = useMutation({
    mutationFn: (data: { from_currency: string; to_currency: string }) =>
      exchangeShortcutsApi.create(data),
    onSuccess: () => {
      invalidateShortcuts()
      toast.success('Shortcut added!')
    },
    onError: (error: any) => {
      if (error?.name === 'OfflineError') return
      const detail = error.response?.data?.detail
      toast.error(detail || 'Failed to add shortcut')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { from_currency: string; to_currency: string } }) =>
      exchangeShortcutsApi.update(id, data),
    onSuccess: () => {
      invalidateShortcuts()
      setEditingId(null)
      toast.success('Shortcut updated!')
    },
    onError: (error: any) => {
      if (error?.name === 'OfflineError') return
      const detail = error.response?.data?.detail
      toast.error(detail || 'Failed to update shortcut')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => exchangeShortcutsApi.delete(id),
    onSuccess: () => {
      invalidateShortcuts()
      toast.success('Shortcut deleted!')
    },
    onError: (error: any) => {
      if (error?.name === 'OfflineError') return
      toast.error('Failed to delete shortcut')
    },
  })

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (newFrom === newTo) {
      toast.error('Currencies must be different')
      return
    }
    createMutation.mutate({ from_currency: newFrom, to_currency: newTo })
  }

  const handleStartEdit = (shortcut: ExchangeShortcut) => {
    setEditingId(shortcut.id)
    setEditFrom(shortcut.from_currency)
    setEditTo(shortcut.to_currency)
  }

  const handleSaveEdit = () => {
    if (editFrom === editTo) {
      toast.error('Currencies must be different')
      return
    }
    updateMutation.mutate({ id: editingId!, data: { from_currency: editFrom, to_currency: editTo } })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id)
  }

  if (!isOpen) return null

  return (
    <Modal open={isOpen} onClose={onClose} size="md" className="p-6">
        <h2 className="font-sans font-semibold text-text text-sm mb-6">
          Manage Shortcuts
        </h2>

        {/* Existing shortcuts list */}
        {shortcuts.length === 0 ? (
          <p className="text-text-muted text-sm mb-6">No shortcuts yet. Add one below.</p>
        ) : (
          <div className="space-y-2 mb-6">
            {shortcuts.map(shortcut => (
              <div
                key={shortcut.id}
                className="flex items-center justify-between p-3 bg-surface-hover rounded-sm"
              >
                {editingId === shortcut.id ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Select
                        value={editFrom}
                        onChange={(v) => setEditFrom(v)}
                        options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                        mono
                        aria-label="Edit from currency"
                        className="w-24"
                      />
                      <span className="text-text-muted">→</span>
                      <Select
                        value={editTo}
                        onChange={(v) => setEditTo(v)}
                        options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                        mono
                        aria-label="Edit to currency"
                        className="w-24"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleSaveEdit}
                        disabled={updateMutation.isPending}
                        className="text-primary hover:text-primary-hover text-sm font-medium disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="text-text-muted hover:text-text text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="font-mono font-medium text-text text-sm">
                      {shortcut.from_currency} → {shortcut.to_currency}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEdit(shortcut)}
                        className="text-text-muted hover:text-text text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(shortcut.id)}
                        disabled={deleteMutation.isPending}
                        className="text-negative hover:opacity-80 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add shortcut form */}
        <form onSubmit={handleAdd}>
          <div className="flex items-center gap-2">
            <Select
              value={newFrom}
              onChange={(v) => setNewFrom(v)}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              mono
              aria-label="New shortcut from currency"
              className="w-24"
            />
            <span className="text-text-muted">→</span>
            <Select
              value={newTo}
              onChange={(v) => setNewTo(v)}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              mono
              aria-label="New shortcut to currency"
              className="w-24"
            />
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? '...' : 'Add'}
            </button>
          </div>
        </form>
    </Modal>
  )
}
