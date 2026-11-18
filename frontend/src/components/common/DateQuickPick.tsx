import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import DatePicker from '../DatePicker'
import SegmentedControl from './SegmentedControl'
import { toIsoDate } from '../../utils/dates'
import { formatQuickPickDate } from '../../utils/format'

/** "Other" segment value - intercepted, never committed. Authored literal,
 *  hence module-level UPPER_SNAKE; a yyyy-MM-dd value can never look like
 *  this, so it cannot collide with a real date. */
const OTHER = '__other__'

interface Props {
  /** Selected date as a local yyyy-MM-dd string (DatePicker's value shape).
   *  A value outside the three quick picks renders in the third slot. */
  value: string
  onChange: (value: string) => void
  /** Disable the whole control, segments and calendar alike. */
  disabled?: boolean
  /** Layout pass-through onto the control row. */
  className?: string
}

/**
 * One-tap date control: Today / Yesterday / the day before (labeled by its
 * weekday) / Other. "Other" opens the existing DatePicker (desktop popup
 * anchored under this row, mobile bottom sheet) and whatever it picks
 * becomes the value - a custom pick replaces the third slot so the choice
 * stays visible.
 *
 * Keyboard-only operation is inherited from the composed SegmentedControl
 * (radiogroup, roving tabindex, arrows, Enter/Space). Deliberate behavior:
 * the radiogroup commits on arrow-move, so arrowing ONTO "Other" opens the
 * calendar - accepted, not worked around. While the calendar is open the
 * popup's day buttons are the next tab stops after the segments.
 */
export default function DateQuickPick({ value, onChange, disabled = false, className }: Props) {
  const { t } = useTranslation('common')
  const [pickerOpen, setPickerOpen] = useState(false)

  // Re-derived on every render (never hoisted to module scope) so a session
  // crossing midnight re-derives all three quick-pick values. Local Date
  // arithmetic + toIsoDate - never toISOString(), which renders the UTC day.
  const now = new Date()
  const todayIso = toIsoDate(now)
  const yesterdayIso = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const dayBeforeIso = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2))

  // A value outside the three quick picks takes over the third slot: its
  // own ISO becomes the option's value (so the control marks it selected)
  // and its formatted date becomes the label.
  const isCustom = value !== todayIso && value !== yesterdayIso && value !== dayBeforeIso

  // Sentinel interception: "Other" opens the calendar instead of committing.
  // Every other value - including today/yesterday/day-before picked from
  // the calendar - commits through to onChange untouched.
  const handleChange = (next: string) => {
    if (next === OTHER) {
      setPickerOpen(true)
      return
    }
    onChange(next)
  }

  return (
    <div
      className={className}
      onKeyDown={(e) => {
        // The hidden DatePicker input cannot own DatePicker's usual Escape
        // keydown (it is display:none and never focusable), so consume
        // Escape here while the calendar is open - preventDefault +
        // stopPropagation, the same discipline as the input's own handler -
        // or Escape would bubble past this control into a surrounding
        // Modal and close the whole dialog with the calendar still open.
        if (e.key !== 'Escape' || !pickerOpen) return
        e.preventDefault()
        e.stopPropagation()
        setPickerOpen(false)
      }}
    >
      <SegmentedControl
        value={value}
        onChange={handleChange}
        disabled={disabled}
        aria-label={t('dateQuickPick.ariaLabel')}
        options={[
          { value: todayIso, label: t('dateQuickPick.today') },
          { value: yesterdayIso, label: t('dateQuickPick.yesterday') },
          {
            value: isCustom ? value : dayBeforeIso,
            label: isCustom
              ? formatQuickPickDate(value, 'date')
              : formatQuickPickDate(dayBeforeIso, 'weekday'),
          },
          { value: OTHER, label: t('dateQuickPick.other') },
        ]}
      />
      {/* The calendar half. Its trigger input is visually hidden (the
          segments ARE the control), but the DatePicker stays mounted with
          its in-flow wrapper: that zero-height wrapper is the desktop
          popup's anchor - the popup renders right below this row - and the
          mobile sheet's home. Clicking any segment while the popup is open
          first closes it via DatePicker's outside-mousedown handler, then
          the click commits - an instantaneous close-then-reopen when that
          segment is "Other". */}
      <DatePicker
        value={value}
        onChange={onChange}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        disabled={disabled}
        className="hidden"
      />
    </div>
  )
}
