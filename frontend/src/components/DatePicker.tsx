import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { format, parse } from 'date-fns'
import 'react-day-picker/style.css'
import { useTranslation } from 'react-i18next'
import { useUserPreferences } from '../contexts/UserPreferencesContext'
import { useLanguage } from '../i18n/LanguageContext'
import { getDateLocale } from '../i18n/dateLocales'
import { useBreakpoint } from '../hooks/useBreakpoint'
import BottomSheet from './common/BottomSheet'
import { inputClass } from './common/formStyles'

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
  required?: boolean
  disabled?: boolean
  id?: string
  placeholder?: string
  inline?: boolean
  /** Desktop popup anchor edge. 'left' (default) is today's flush-left
      anchor; 'right' pins the popup's right edge to the wrapper's right
      edge - for triggers in the last column of a grid row, where a
      left-anchored popup would overflow the panel. No effect on mobile
      (the calendar opens in a bottom sheet) or inline mode. */
  align?: 'left' | 'right'
  /** Controlled calendar open state. When provided it drives the popup
      (desktop) / bottom sheet (mobile) in place of internal state; the
      trigger input's focus/click and every internal close path (day
      select, Escape, click-outside, sheet dismiss) report through
      onOpenChange instead. Omit for the uncontrolled trigger behavior
      every existing caller uses. */
  open?: boolean
  /** Open-state notifications for a controlled caller; fires on every
      internal open/close transition. Meaningless without `open`. */
  onOpenChange?: (open: boolean) => void
}

export default function DatePicker({
  value,
  onChange,
  className = '',
  required = false,
  disabled = false,
  id,
  placeholder,
  inline = false,
  align = 'left',
  open,
  onOpenChange,
}: Props) {
  const { t } = useTranslation('numbers')
  const { language } = useLanguage()
  const { calendarStartDay } = useUserPreferences()
  const { isMobile } = useBreakpoint()
  // Controlled-open merge: `open` drives the calendar when provided, else
  // the internal state does - a caller that passes no `open` gets behavior
  // identical to the purely internal version (open === undefined means
  // every branch below resolves to the state this component itself set).
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = open !== undefined ? open : internalOpen
  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next)
    onOpenChange?.(next)
  }
  const containerRef = useRef<HTMLDivElement>(null)

  // Calendar chrome locale (month/weekday names). The input value stays ISO
  // yyyy-MM-dd - it feeds the API - and weekStartsOn stays driven by the
  // explicit calendar-start-day preference, overriding the locale default.
  const locale = getDateLocale(language)
  const resolvedPlaceholder = placeholder ?? t('datePicker.selectDate')

  const isoToJsWeekday = (isoDay: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 => {
    return (isoDay === 7 ? 0 : isoDay) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  }

  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined

  const handleDaySelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'))
      setOpen(false)
    }
  }

  // The document-level outside-click close must fire the CURRENT render's
  // close path (a controlled caller may pass a fresh onOpenChange arrow per
  // render), so the mount-time listener reads setOpen through a latest-ref
  // instead of capturing the first render's closure.
  const setOpenRef = useRef(setOpen)
  useEffect(() => { setOpenRef.current = setOpen })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenRef.current(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Inline mode: always-visible calendar, no input field, no popup logic.
  // The `rdp-inline` class scopes the compact, full-width, design-token-themed
  // overrides in index.css — the popup path keeps react-day-picker's defaults.
  if (inline) {
    return (
      <div className={`rdp-inline bg-surface rounded-sm border border-border p-3 ${className}`}>
        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={handleDaySelect}
          weekStartsOn={isoToJsWeekday(calendarStartDay)}
          defaultMonth={selectedDate}
          locale={locale}
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        id={id}
        value={value}
        /* Mobile opens on click, not focus: the sheet's focus-return would
           re-fire onFocus and immediately reopen it. */
        onFocus={() => { if (!isMobile) setOpen(true) }}
        onClick={() => { if (isMobile) setOpen(true) }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || !isOpen || isMobile) return
          e.preventDefault()
          // Consume the key: without this, a surrounding Modal's document-level
          // Escape listener (useOverlay) fires too and closes the whole dialog —
          // same rationale as Select's trigger (Select.tsx:166-172).
          e.stopPropagation()
          setOpen(false)
        }}
        className={`${inputClass} ${className}`}
        required={required}
        disabled={disabled}
        placeholder={resolvedPlaceholder}
        readOnly
      />
      {isOpen && !isMobile && (
        <div
          className={`absolute z-dropdown mt-2 bg-surface rounded-sm border border-border p-4${align === 'right' ? ' right-0' : ''}`}
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDaySelect}
            weekStartsOn={isoToJsWeekday(calendarStartDay)}
            defaultMonth={selectedDate}
            locale={locale}
          />
        </div>
      )}

      {/* Mobile: calendar in a bottom sheet with 44px day targets (rdp-sheet scope). */}
      {isMobile && (
        <BottomSheet open={isOpen} onClose={() => setOpen(false)} aria-label={t('datePicker.selectDate')}>
          <div className="rdp-inline rdp-sheet px-4 pb-2">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={handleDaySelect}
              weekStartsOn={isoToJsWeekday(calendarStartDay)}
              defaultMonth={selectedDate}
              locale={locale}
            />
          </div>
          <div className="px-4 pb-3">
            <button
              type="button"
              onClick={() => handleDaySelect(new Date())}
              className="w-full min-h-[44px] bg-surface border border-border rounded-sm text-sm font-medium text-text transition-colors active:bg-surface-hover"
            >
              {t('datePicker.today')}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  )
}
