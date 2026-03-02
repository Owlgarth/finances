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

interface Props {
  preferences: UserPreferences | null
  onSubmit: (data: { calendar_start_day: number }) => void
  isLoading: boolean
}

export default function PreferencesForm({ preferences, onSubmit, isLoading }: Props) {
  const [calendarStartDay, setCalendarStartDay] = useState(7)

  useEffect(() => {
    if (preferences) {
      setCalendarStartDay(preferences.calendar_start_day)
    }
  }, [preferences])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ calendar_start_day: calendarStartDay })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="calendar_start_day" className="block text-sm font-medium text-gray-700 mb-2">
          First Day of the Week
        </label>
        <p className="text-sm text-gray-500 mb-3">
          Choose which day your calendar starts with.
        </p>
        <select
          id="calendar_start_day"
          value={calendarStartDay}
          onChange={(e) => setCalendarStartDay(Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-colors"
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
          className="px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isLoading ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </form>
  )
}
