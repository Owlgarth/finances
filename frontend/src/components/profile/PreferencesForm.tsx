import { useState, useEffect } from 'react'
import type { UserPreferences } from '../../types'
import Select from '../common/Select'

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]

const FONT_OPTIONS = [
  { value: 'geist', label: 'Geist' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
]

interface Props {
  preferences: UserPreferences | null
  onSubmit: (data: { calendar_start_day: number; font_family: string }) => void
  isLoading: boolean
}

export default function PreferencesForm({ preferences, onSubmit, isLoading }: Props) {
  const [calendarStartDay, setCalendarStartDay] = useState(7)
  const [fontFamily, setFontFamily] = useState('geist')

  useEffect(() => {
    if (preferences) {
      setCalendarStartDay(preferences.calendar_start_day)
      setFontFamily(preferences.font_family || 'geist')
    }
  }, [preferences])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ calendar_start_day: calendarStartDay, font_family: fontFamily })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="font_family" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          Font Family
        </label>
        <p className="text-sm text-text-muted mb-3">
          Choose the font used throughout the app.
        </p>
        <Select
          id="font_family"
          value={fontFamily}
          onChange={(v) => setFontFamily(v)}
          options={FONT_OPTIONS}
          aria-label="Font Family"
        />
      </div>

      <div>
        <label htmlFor="calendar_start_day" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          First Day of the Week
        </label>
        <p className="text-sm text-text-muted mb-3">
          Choose which day your calendar starts with.
        </p>
        <Select
          id="calendar_start_day"
          value={calendarStartDay}
          onChange={(v) => setCalendarStartDay(v)}
          options={WEEKDAY_OPTIONS}
          aria-label="First Day of the Week"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </form>
  )
}
