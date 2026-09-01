import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import Select from '../common/Select'
import { PAGE_SIZE_OPTIONS, getStoredPageSize, setStoredPageSize } from '../../utils/pageSize'

/**
 * Browser-local settings (localStorage, not synced to the account). Currently
 * just the shared rows-per-page value used by every paginated table; the
 * table page-size dropdowns write to the same stored value.
 */
export default function LocalSettingsSection() {
  const { t } = useTranslation('settings')
  const [pageSize, setPageSize] = useState(getStoredPageSize)

  return (
    <div className="pt-6 mt-6 border-t border-border">
      <h3 className="text-sm font-medium text-text mb-1">{t('localSettings.title')}</h3>
      <p className="text-sm text-text-muted mb-4">
        {t('localSettings.body')}
      </p>
      <div>
        <label
          htmlFor="rows_per_page"
          className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2"
        >
          {t('localSettings.rowsLabel')}
        </label>
        <p className="text-sm text-text-muted mb-3">
          {t('localSettings.rowsHelper')}
        </p>
        <Select
          id="rows_per_page"
          value={pageSize}
          onChange={(v) => {
            setPageSize(v)
            setStoredPageSize(v)
          }}
          options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
          mono
          aria-label={t('localSettings.rowsAria')}
          className="w-32"
        />
      </div>
    </div>
  )
}
