import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('settings')
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
      link.download = `owlgarth_finances_data_export_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success(t('profilePage.exportSuccess'))
    } catch {
      toast.error(t('profilePage.exportFailed'))
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
      toast.success(t('profilePage.importToast', { count: result.imported_workspaces }))
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        toast.error(t('profilePage.importInvalidJson'))
      } else {
        toast.error(getApiErrorMessage(error, t('profilePage.importFailed')))
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
      toast.success(t('profilePage.profileUpdated'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('profilePage.profileUpdateFailed')))
  })

  const updatePreferencesMutation = useMutation({
    mutationFn: (data: {
      calendar_start_day: number
      font_family: string
      language: string
      number_format: string
    }) => authApi.updatePreferences(data),
    onSuccess: () => {
      // LanguageContext watches this query and applies the server language
      // globally (server-wins). Do NOT switch languages here - the
      // invalidation below is the whole wiring.
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] })
      toast.success(t('profilePage.prefsUpdated'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('profilePage.prefsUpdateFailed')))
  })

  if (!user) {
    return null
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-base font-semibold text-text mb-8">{t('profilePage.title')}</h1>

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
              {t('tabs.profile')}
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`py-2.5 px-4 max-sm:min-h-[44px] text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'password'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              {t('tabs.password')}
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`py-2.5 px-4 max-sm:min-h-[44px] text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'security'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              {t('tabs.security')}
            </button>
            <button
              onClick={() => setActiveTab('preferences')}
              className={`py-2.5 px-4 max-sm:min-h-[44px] text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'preferences'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              {t('tabs.preferences')}
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`py-2.5 px-4 max-sm:min-h-[44px] text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'account'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              {t('tabs.account')}
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
                <h3 className="text-sm font-medium text-text mb-2">{t('importSection.title')}</h3>
                <p className="text-sm text-text-muted mb-4">
                  {t('importSection.body')}
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
                  {isImporting ? t('importSection.importing') : t('importSection.submit')}
                </button>
                {importResult && (
                  <div className="mt-4 p-4 bg-surface-hover rounded-sm border border-border text-sm space-y-1">
                    <p className="font-medium text-text">{t('importSection.summaryTitle')}</p>
                    <p className="text-text-muted">{t('importSection.workspaces', { count: importResult.imported_workspaces })}</p>
                    <p className="text-text-muted">{t('importSection.accounts', { count: importResult.imported_accounts })}</p>
                    <p className="text-text-muted">{t('importSection.budgets', { count: importResult.imported_budgets })}</p>
                    <p className="text-text-muted">{t('importSection.categories', { count: importResult.imported_categories })}</p>
                    <p className="text-text-muted">{t('importSection.transactions', { count: importResult.imported_transactions })}</p>
                    <p className="text-text-muted">{t('importSection.transfers', { count: importResult.imported_transfers })}</p>
                    <p className="text-text-muted">{t('importSection.planned', { count: importResult.imported_planned_transactions })}</p>
                    {Object.keys(importResult.renamed).length > 0 && (
                      <p className="text-text-muted">
                        {t('importSection.renamed', {
                          list: Object.entries(importResult.renamed).map(([from, to]) => `${from} → ${to}`).join(', '),
                        })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-medium text-text mb-2">{t('legacySection.title')}</h3>
                <p className="text-sm text-text-muted mb-4">
                  {t('legacySection.body')}
                </p>
                <button
                  onClick={() => setLegacyImportOpen(true)}
                  className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
                >
                  {t('legacySection.open')}
                </button>
                <LegacyImportModal open={legacyImportOpen} onClose={() => setLegacyImportOpen(false)} />
              </div>

              <div>
                <h3 className="text-sm font-medium text-text mb-2">{t('exportSection.title')}</h3>
                <p className="text-sm text-text-muted mb-4">
                  {t('exportSection.body')}
                </p>
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {isExporting ? t('exportSection.exporting') : t('exportSection.submit')}
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
