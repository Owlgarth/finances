import { useState } from 'react'

import Select from '../common/Select'
import { PAGE_SIZE_OPTIONS, getStoredPageSize, setStoredPageSize } from '../../utils/pageSize'

/**
 * Browser-local settings (localStorage, not synced to the account). Currently
 * just the shared rows-per-page value used by every paginated table; the
 * table page-size dropdowns write to the same stored value.
 */
export default function LocalSettingsSection() {
  const [pageSize, setPageSize] = useState(getStoredPageSize)

  return (
    <div className="pt-6 mt-6 border-t border-border">
      <h3 className="text-sm font-medium text-text mb-1">This device</h3>
      <p className="text-sm text-text-muted mb-4">
        Saved in this browser only — not synced to your account.
      </p>
      <div>
        <label
          htmlFor="rows_per_page"
          className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2"
        >
          Rows per page
        </label>
        <p className="text-sm text-text-muted mb-3">
          Default number of rows shown in paginated tables (transactions, planned).
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
          aria-label="Rows per page"
          className="w-32"
        />
      </div>
    </div>
  )
}
