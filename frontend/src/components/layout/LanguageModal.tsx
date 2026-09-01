import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { authApi } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { getApiErrorMessage } from '../../utils/errors'
import Modal from '../common/Modal'
import registry from '../../../../backend/common/languages.json'

interface LanguageModalProps {
  onClose: () => void
}

/** Language switcher modal, opened by the "Language" row in the desktop
 *  UserMenu dropdown and the mobile More sheet (BottomNav). One card per
 *  registry language showing nativeName (plus englishName when it differs),
 *  with a check on the active one; the card list scrolls, so any number of
 *  languages stays usable.
 *
 *  Mount-per-use: the caller renders this component ONLY while the picker
 *  is open - that conditional render is the open/close mechanism - and each
 *  host closes itself before opening this modal, so only one overlay layer
 *  is ever mounted (one Escape press, one dismissal).
 *
 *  Switch semantics: optimistic local switch (setLanguage) first; when
 *  authenticated, fire a PATCH and invalidate ['user-preferences']. A failed
 *  PATCH only toasts - it does NOT revert the optimistic switch (a saved
 *  preference is a nicety; the session language is the user's expressed
 *  intent). Selecting a card applies the switch and dismisses the modal in
 *  the same click. */
export default function LanguageModal({ onClose }: LanguageModalProps) {
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

  // Apply-and-dismiss, mirroring Select's selectIndex and ActionSheet's
  // onSelect-after-onClose: the switch lands first, then the modal goes.
  const select = (code: string) => {
    setLanguage(code)
    if (isAuthenticated) savePreference.mutate(code)
    onClose()
  }

  return (
    // No overflow-y-auto on the panel itself: the inner list is the scroll
    // child, so the title stays pinned and the mobile sheet (which already
    // scrolls its own panel) never double-scrolls.
    <Modal open onClose={onClose} title={t('language')} size="sm" className="p-6 flex flex-col max-h-[85vh]">
      <div
        role="group"
        aria-label={t('language')}
        className="flex-1 min-h-0 space-y-2 overflow-y-auto scrollbar-thin pointer-coarse:scrollbar-none overscroll-contain -mr-2 pr-2"
      >
        {registry.languages.map((l) => {
          const active = language === l.code
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => select(l.code)}
              aria-pressed={active}
              className={`w-full flex items-center gap-3 p-3 min-h-[56px] rounded-sm text-left transition-colors
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus
                active:bg-surface-hover
                ${active ? 'border border-primary ring-1 ring-primary' : 'border border-border hover:bg-surface-hover'}`}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-text truncate">{l.nativeName}</span>
                {l.englishName !== l.nativeName && (
                  <span className="block text-xs text-text-muted truncate">{l.englishName}</span>
                )}
              </span>
              {/* Fixed-width check slot so names do not shift on selection change. */}
              <span className="w-4 flex-shrink-0 flex items-center justify-center">
                {active && <Check size={16} className="text-primary" />}
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
