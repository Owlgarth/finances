import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authApi } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useUserPreferences } from '../contexts/UserPreferencesContext'
import { getApiErrorMessage } from '../utils/errors'
import EditProfileForm from '../components/profile/EditProfileForm'
import ChangePasswordForm from '../components/profile/ChangePasswordForm'
import PreferencesForm from '../components/profile/PreferencesForm'
import LocalSettingsSection from '../components/profile/LocalSettingsSection'
import DeleteAccountSection from '../components/profile/DeleteAccountSection'
import ResetAccountSection from '../components/profile/ResetAccountSection'
import TwoFactorSection from '../components/profile/TwoFactorSection'
import LegacyImportModal from '../components/profile/LegacyImportModal'

import type { ImportResult } from '../types'

type Tab = 'profile' | 'password' | 'security' | 'preferences' | 'account'

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const { preferences } = useUserPreferences()
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const queryClient = useQueryClient()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [legacyImportOpen, setLegacyImportOpen] = useState(false)

  const handleExportData = async () => {
    setIsExporting(true)
    try {
      const blob = await authApi.exportData()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `denarly_data_export_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('Data exported successfully!')
    } catch {
      toast.error('Failed to export data. Please try again later.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const exportData = JSON.parse(text)
      const result = await authApi.importData(exportData)
      setImportResult(result)
      toast.success(`Imported ${result.imported_workspaces} workspace(s) successfully!`)
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        toast.error('Invalid JSON file. Please select a valid export file.')
      } else {
        toast.error(getApiErrorMessage(error, 'Failed to import data. Please try again.'))
      }
    } finally {
      setIsImporting(false)
      if (importFileRef.current) {
        importFileRef.current.value = ''
      }
    }
  }

  const updateProfileMutation = useMutation({
    mutationFn: (data: { full_name?: string }) =>
      authApi.updateProfile(data),
    onSuccess: (updatedUser) => {
      updateUser(updatedUser)
      toast.success('Profile updated successfully!')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to update profile'))
  })

  const updatePreferencesMutation = useMutation({
    mutationFn: (data: { calendar_start_day: number; font_family: string }) =>
      authApi.updatePreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] })
      toast.success('Preferences updated successfully!')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to update preferences'))
  })

  if (!user) {
    return null
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-base font-semibold text-text mb-8">Profile Settings</h1>

      <div className="bg-surface border border-border rounded-sm">
        <div className="py-3 px-3">
          <nav className="flex flex-wrap gap-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-2.5 px-4 max-sm:min-h-[44px] text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'profile'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`py-2.5 px-4 max-sm:min-h-[44px] text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'password'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              Password
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`py-2.5 px-4 max-sm:min-h-[44px] text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'security'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              Security
            </button>
            <button
              onClick={() => setActiveTab('preferences')}
              className={`py-2.5 px-4 max-sm:min-h-[44px] text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'preferences'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              Preferences
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`py-2.5 px-4 max-sm:min-h-[44px] text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'account'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              Account
            </button>
          </nav>
        </div>

        <div className="p-6 max-sm:p-4">
          {activeTab === 'profile' && (
            <EditProfileForm
              user={user}
              onSubmit={(data) => updateProfileMutation.mutate(data)}
              isLoading={updateProfileMutation.isPending}
            />
          )}

          {activeTab === 'password' && <ChangePasswordForm />}

          <div className={activeTab === 'security' ? '' : 'hidden'}>
            <TwoFactorSection />
          </div>

          {activeTab === 'preferences' && (
            <>
              <PreferencesForm
                preferences={preferences || null}
                onSubmit={(data) => updatePreferencesMutation.mutate(data)}
                isLoading={updatePreferencesMutation.isPending}
              />
              <LocalSettingsSection />
            </>
          )}

          {activeTab === 'account' && (
            <div className="space-y-10">
              <div>
                <h3 className="text-sm font-medium text-text mb-2">Import Your Data</h3>
                <p className="text-sm text-text-muted mb-4">
                  Restore your data from a Denarly export (v3.0) JSON file.
                  If a workspace with the same name already exists, it will be renamed automatically.
                </p>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <button
                  onClick={() => importFileRef.current?.click()}
                  disabled={isImporting}
                  className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {isImporting ? 'Importing...' : 'Import Data'}
                </button>
                {importResult && (
                  <div className="mt-4 p-4 bg-surface-hover rounded-sm border border-border text-sm space-y-1">
                    <p className="font-medium text-text">Import Summary</p>
                    <p className="text-text-muted">Workspaces: {importResult.imported_workspaces}</p>
                    <p className="text-text-muted">Accounts: {importResult.imported_accounts}</p>
                    <p className="text-text-muted">Budgets: {importResult.imported_budgets}</p>
                    <p className="text-text-muted">Categories: {importResult.imported_categories}</p>
                    <p className="text-text-muted">Transactions: {importResult.imported_transactions}</p>
                    <p className="text-text-muted">Transfers: {importResult.imported_transfers}</p>
                    <p className="text-text-muted">Planned Transactions: {importResult.imported_planned_transactions}</p>
                    {Object.keys(importResult.renamed).length > 0 && (
                      <p className="text-text-muted">
                        Renamed: {Object.entries(importResult.renamed).map(([from, to]) => `${from} → ${to}`).join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-medium text-text mb-2">Import from an older Denarly version</h3>
                <p className="text-sm text-text-muted mb-4">
                  Migrating from a previous version? Upload the JSON export from the old app. It will be
                  converted to the new account-based model — exchanges become transfers, and a verification
                  report shows each account's balance. Reconcile any warnings with a "Set balance…" on the
                  Accounts page.
                </p>
                <button
                  onClick={() => setLegacyImportOpen(true)}
                  className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
                >
                  Import legacy export
                </button>
                <LegacyImportModal open={legacyImportOpen} onClose={() => setLegacyImportOpen(false)} />
              </div>

              <div>
                <h3 className="text-sm font-medium text-text mb-2">Export Your Data</h3>
                <p className="text-sm text-text-muted mb-4">
                  Download a complete copy of all your personal data in JSON format.
                  This includes your profile, preferences, all transactions, budgets, and workspace data.
                </p>
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {isExporting ? 'Exporting...' : 'Export All My Data'}
                </button>
              </div>

              <div className="bg-warning-bg rounded-sm border border-border p-6">
                <ResetAccountSection />
              </div>

              <div className="bg-negative-bg rounded-sm border border-border p-6">
                <DeleteAccountSection />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
