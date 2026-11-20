import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import type { DateRange } from 'react-day-picker'
import { isValid, parse, parseISO } from 'date-fns'
import type { Locale } from 'date-fns/locale'
import 'react-day-picker/style.css'
import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'
import { useUserPreferences } from '../../contexts/UserPreferencesContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { getDateLocale } from '../../i18n/dateLocales'
import { formatQuickPickDate, getNumberStyle } from '../../utils/format'
import { monthRange, toIsoDate } from '../../utils/dates'
import { inputClass, controlHeightClass } from '../common/formStyles'

// Ranges span the WHOLE period (month/year ends included): future dates inside
// the period matter for the Planned list, and post-dated transactions are not
// silently excluded either. "Today" is computed at click/render time so a
// session crossing midnight never serves a stale range. Labels resolve
// through t() at render time - the stable labelKey doubles as the React key
// so a language switch never re-keys the chips.
const DATE_PRESETS = [
  {
    labelKey: 'listFilters.presetThisMonth',
    range: () => {
      const now = new Date()
      return monthRange(now.getFullYear(), now.getMonth())
    },
  },
  {
    labelKey: 'listFilters.presetLastMonth',
    range: () => {
      const now = new Date()
      return monthRange(now.getFullYear(), now.getMonth() - 1)
    },
  },
  {
    labelKey: 'listFilters.presetLast30',
    range: () => {
      const start = new Date()
      start.setDate(start.getDate() - 29)
      return { from: toIsoDate(start), to: toIsoDate(new Date()) }
    },
  },
  {
    labelKey: 'listFilters.presetThisYear',
    range: () => {
      const year = new Date().getFullYear()
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    },
  },
  // All time: no range() - clicking clears both bounds ({from: null, to:
  // null} deletes the params via ParamPatch). LAST position: the row
  // reads narrow -> broad.
  { labelKey: 'listFilters.presetAllTime', allTime: true },
] as const

// 1..7 ISO weekday -> 0..6 JS weekday (7 = Sunday = 0) - the same
// conversion DatePicker applies to the calendar_start_day preference.
const isoToJsWeekday = (isoDay: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 =>
  (isoDay === 7 ? 0 : isoDay) as 0 | 1 | 2 | 3 | 4 | 5 | 6

// Localized short-date parsing - the input mirror of formatQuickPickDate
// (utils/format.ts): 'en' style reads month names, 'eu' style reads numeric
// dd.MM, a missing year means the current one, and the ISO shape is
// accepted as INPUT ONLY (paste) in both styles - display never shows it.
// date-fns parse rejects overflowing component values ("30.02", "13.13"),
// so isValid is sufficient validation.
function parseShortDate(input: string, locale: Locale): Date | null {
  const text = input.trim()
  if (!text) return null
  const patterns =
    getNumberStyle() === 'eu'
      ? ['dd.MM.yyyy', 'dd.MM', 'yyyy-MM-dd']
      : ['MMM d y', 'MMM d', 'yyyy-MM-dd']
  for (const pattern of patterns) {
    const parsed = parse(text, pattern, new Date(), { locale })
    if (isValid(parsed)) return parsed
  }
  return null
}

// Display text for a bound: localized short date for a valid ISO param,
// the raw string for garbage (never crash on a hand-edited URL), '' unset.
function displayFor(iso: string): string {
  if (!iso) return ''
  const parsed = parseISO(iso)
  return isValid(parsed) ? formatQuickPickDate(iso, 'date') : iso
}

interface DateRangeEditorProps {
  /** Raw from/to param strings; '' means unset. */
  value: { from: string; to: string }
  /** Full next state; null deletes the param through the host's updateParams. */
  onChange: (next: { from: string | null; to: string | null }) => void
}

/** Container-agnostic date-range body: preset chips, From/To short-date
 *  inputs, and an always-visible range calendar. No trigger, no popup
 *  chrome, no internal scrolling - the host owns the panel, focus and
 *  Escape. */
export default function DateRangeEditor({ value, onChange }: DateRangeEditorProps) {
  const { t } = useTranslation('transactions')
  const { language } = useLanguage()
  const { calendarStartDay } = useUserPreferences()
  const locale = getDateLocale(language)

  const displayFrom = displayFor(value.from)
  const displayTo = displayFor(value.to)

  // Drafts are derived-until-touched: while a field is not focused, the
  // draft tracks the prop's display (a preset click or calendar click
  // re-derives it); while focused, the draft is what the user typed.
  const [fromDraft, setFromDraft] = useState(displayFrom)
  const [toDraft, setToDraft] = useState(displayTo)
  const [focused, setFocused] = useState<'from' | 'to' | null>(null)
  const [invalid, setInvalid] = useState<'from' | 'to' | null>(null)
  if (focused !== 'from' && fromDraft !== displayFrom) setFromDraft(displayFrom)
  if (focused !== 'to' && toDraft !== displayTo) setToDraft(displayTo)

  const commit = (which: 'from' | 'to') => {
    setFocused(null)
    const draft = (which === 'from' ? fromDraft : toDraft).trim()
    const snapshot = { from: value.from || null, to: value.to || null }
    if (draft === '') {
      setInvalid(null)
      onChange({ ...snapshot, [which]: null })
      return
    }
    const parsed = parseShortDate(draft, locale)
    if (!parsed) {
      // Invalid entry reverts on blur: the draft snaps back to the last
      // valid display, the URL keeps its value, and the under-field error
      // explains it - never a toast.
      setInvalid(which)
      if (which === 'from') setFromDraft(displayFrom)
      else setToDraft(displayTo)
      return
    }
    setInvalid(null)
    onChange({ ...snapshot, [which]: toIsoDate(parsed) })
  }

  // Controlled range state derived from the params. Garbage ISO strings
  // are dropped (isValid guard) rather than fed to the calendar.
  const from = value.from ? parseISO(value.from) : undefined
  const to = value.to ? parseISO(value.to) : undefined
  const fromDate = from && isValid(from) ? from : undefined
  const toDate = to && isValid(to) ? to : undefined
  const selected: DateRange | undefined =
    fromDate || toDate ? { from: fromDate, to: toDate } : undefined

  const handleRangeSelect = (range: DateRange | undefined) => {
    onChange({
      from: range?.from ? toIsoDate(range.from) : null,
      to: range?.to ? toIsoDate(range.to) : null,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {DATE_PRESETS.map((preset) => {
          // All time has no range() - clicking it clears both bounds, and
          // it is active only when NEITHER date param is set. Range presets
          // are active only on an EXACT match: any manually edited bound
          // leaves every chip off by construction.
          const range = 'allTime' in preset ? null : preset.range()
          const active = range
            ? value.from === range.from && value.to === range.to
            : value.from === '' && value.to === ''
          return (
            <button
              key={preset.labelKey}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange(range ? { from: range.from, to: range.to } : { from: null, to: null })
              }
              className={`text-xs border rounded-sm px-2 py-1 ${controlHeightClass} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
                active ? 'border-border-focus bg-surface-hover text-text' : 'border-border text-text-muted'
              }`}
            >
              {t(preset.labelKey)}
            </button>
          )
        })}
      </div>

      {/* Paired-input wrap recipe (the collapsible filter panels' date
          row): below sm the pair cannot share one line - each w-full input
          claims its own full line (w-full doubles as basis-full) and the
          separator hides below sm. At >=sm the row is one line. */}
      <div className="flex max-sm:flex-wrap items-center gap-1.5">
        <input
          type="text"
          value={fromDraft}
          onChange={(e) => {
            setFromDraft(e.target.value)
            if (invalid === 'from') setInvalid(null)
          }}
          onFocus={() => setFocused('from')}
          onBlur={() => commit('from')}
          aria-label={t('listFilters.fromDateAria')}
          aria-invalid={invalid === 'from' || undefined}
          className={`${inputClass} max-sm:min-h-[44px]`}
        />
          <span className="text-text-muted text-xs max-sm:hidden">–</span>
        <input
          type="text"
          value={toDraft}
          onChange={(e) => {
            setToDraft(e.target.value)
            if (invalid === 'to') setInvalid(null)
          }}
          onFocus={() => setFocused('to')}
          onBlur={() => commit('to')}
          aria-label={t('listFilters.toDateAria')}
          aria-invalid={invalid === 'to' || undefined}
          className={`${inputClass} max-sm:min-h-[44px]`}
        />
      </div>
      {invalid && (
        <div role="alert" className="flex items-center gap-1 text-[11px] text-negative font-medium">
          <AlertCircle size={12} className="shrink-0" />
          <span>{t('listFilters.dateInvalid')}</span>
        </div>
      )}

      {/* First range-mode calendar. rdp-inline carries the compact geometry
          + token overrides (shared with the single-date paths, unchanged);
          rdp-range-editor layers the range-state colors and the coarse-
          pointer 44px targets (index.css). The reset-on-select prop below
          is load-bearing: react-day-picker v10 applies no default for it,
          and without it a third click extends the completed range instead
          of restarting it. */}
      <div className="rdp-inline rdp-range-editor">
        <DayPicker
          mode="range"
          selected={selected}
          onSelect={handleRangeSelect}
          resetOnSelect
          weekStartsOn={isoToJsWeekday(calendarStartDay)}
          defaultMonth={fromDate ?? toDate ?? new Date()}
          locale={locale}
        />
      </div>
    </div>
  )
}
