import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Globe } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { authApi } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { getApiErrorMessage } from '../../utils/errors'
import registry from '../../../../backend/common/languages.json'

/** Language switcher group shared by the desktop UserMenu dropdown and the
 *  mobile More sheet (BottomNav). Non-interactive label row + one 44px row
 *  per registry language showing nativeName, with a check on the active one
 *  (touch-target rule; row shape mirrors the workspace switcher in BottomNav).
 *
 *  Switch semantics: optimistic local switch (setLanguage) first; when
 *  authenticated, fire a PATCH and invalidate ['user-preferences']. A failed
 *  PATCH only toasts - it does NOT revert the optimistic switch (a saved
 *  preference is a nicety; the session language is the user's expressed
 *  intent). */
export default function LanguageMenu() {
  const { t } = useTranslation('nav')
  const { language, setLanguage } = useLanguage()
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()

  const savePreference = useMutation({
    mutationFn: (code: string) => authApi.updatePreferences({ language: code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] })
    },
    onError: (error) => {
      // Deliberate: no revert of the optimistic switch (see docblock).
      toast.error(getApiErrorMessage(error, t('languageSaveFailed')))
    },
  })

  return (
    <div role="group" aria-label={t('language')}>
      <div className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-text-muted truncate flex items-center gap-2">
        <Globe size={14} strokeWidth={1.5} className="flex-shrink-0" />
        {t('language')}
      </div>
      {registry.languages.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => {
            setLanguage(l.code)
            if (isAuthenticated) savePreference.mutate(l.code)
          }}
          aria-pressed={language === l.code}
          className="w-full min-h-[44px] px-4 flex items-center gap-3 text-sm text-left text-text transition-colors hover:bg-surface-hover active:bg-surface-hover"
        >
          {language === l.code ? (
            <Check size={16} className="text-primary flex-shrink-0" />
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <span className="truncate">{l.nativeName}</span>
        </button>
      ))}
    </div>
  )
}
