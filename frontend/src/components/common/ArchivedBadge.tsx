import { useTranslation } from 'react-i18next'

/** Inline "Archived" chip marking archived rows (accounts, budgets,
 *  categories). Byte-identical presentation at every consumer; the
 *  label translates internally through the common namespace
 *  (archivedBadge), so consumers need no t() wiring of their own. */
export default function ArchivedBadge() {
  const { t } = useTranslation('common')
  return (
    <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted border border-border rounded-sm px-1.5 py-0.5">
      {t('archivedBadge')}
    </span>
  )
}
