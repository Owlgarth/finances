import { useState, useEffect } from 'react'
import type { UserPreferences } from '../../types'

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
  { value: 'inter', label: 'Inter' },
  { value: 'system', label: 'System UI' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'lato', label: 'Lato' },
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
        <label htmlFor="font_family" className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-2">
          Font Family
        </label>
        <p className="text-sm text-on-surface-variant mb-3">
          Choose the font used throughout the app.
        </p>
        <select
          id="font_family"
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
        >
          {FONT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="calendar_start_day" className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-2">
          First Day of the Week
        </label>
        <p className="text-sm text-on-surface-variant mb-3">
          Choose which day your calendar starts with.
        </p>
        <select
          id="calendar_start_day"
          value={calendarStartDay}
          onChange={(e) => setCalendarStartDay(Number(e.target.value))}
          className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
        >
          {WEEKDAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2.5 text-on-primary rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary-container focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium bg-gradient-to-br from-primary to-primary-dim active:scale-[0.98]"
        >
          {isLoading ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </form>
  )
}
