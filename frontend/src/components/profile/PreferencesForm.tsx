import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { UserPreferences } from '../../types'
import Select from '../common/Select'
import registry from '../../../../backend/common/languages.json'

// Font names are proper nouns - they stay untranslated in every UI language.
const FONT_OPTIONS = [
  { value: 'geist', label: 'Geist' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
]

// Registry-driven options are DATA, not translations: language labels are
// each language's nativeName (every language names itself in its own script)
// and number-format labels are locale-neutral samples. Never wrap either in t().
const LANGUAGE_OPTIONS = registry.languages.map((l) => ({ value: l.code, label: l.nativeName }))
const NUMBER_FORMAT_OPTIONS = registry.numberFormats.map((f) => ({ value: f.code, label: f.label }))

// The values 1-7 are API enum values - untranslated; only the labels resolve
// through t() where it is in scope (inside the component).
const WEEKDAY_KEYS = [1, 2, 3, 4, 5, 6, 7] as const
const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

interface Props {
  preferences: UserPreferences | null
  onSubmit: (data: {
    calendar_start_day: number
    font_family: string
    language: string
    number_format: string
  }) => void
  isLoading: boolean
}

export default function PreferencesForm({ preferences, onSubmit, isLoading }: Props) {
  const { t } = useTranslation('settings')
  const [calendarStartDay, setCalendarStartDay] = useState(7)
  const [fontFamily, setFontFamily] = useState('geist')
  const [selectedLanguage, setSelectedLanguage] = useState(registry.defaultLanguage)
  const [numberFormat, setNumberFormat] = useState(registry.defaultNumberFormat)

  useEffect(() => {
    if (preferences) {
      setCalendarStartDay(preferences.calendar_start_day)
      setFontFamily(preferences.font_family || 'geist')
      setSelectedLanguage(preferences.language || registry.defaultLanguage)
      setNumberFormat(preferences.number_format || registry.defaultNumberFormat)
    }
  }, [preferences])

  const weekdayOptions = WEEKDAY_KEYS.map((d) => ({
    value: d,
    label: t(`weekdays.${WEEKDAY_NAMES[d - 1]}`),
  }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      calendar_start_day: calendarStartDay,
      font_family: fontFamily,
      language: selectedLanguage,
      number_format: numberFormat,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="font_family" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          {t('preferences.fontLabel')}
        </label>
        <p className="text-sm text-text-muted mb-3">
          {t('preferences.fontHelper')}
        </p>
        <Select
          id="font_family"
          value={fontFamily}
          onChange={(v) => setFontFamily(v)}
          options={FONT_OPTIONS}
          aria-label={t('preferences.fontAria')}
        />
      </div>

      <div>
        <label htmlFor="calendar_start_day" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          {t('preferences.weekLabel')}
        </label>
        <p className="text-sm text-text-muted mb-3">
          {t('preferences.weekHelper')}
        </p>
        <Select
          id="calendar_start_day"
          value={calendarStartDay}
          onChange={(v) => setCalendarStartDay(v)}
          options={weekdayOptions}
          aria-label={t('preferences.weekAria')}
        />
      </div>

      <div>
        <label htmlFor="language" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          {t('preferences.languageLabel')}
        </label>
        <p className="text-sm text-text-muted mb-3">{t('preferences.languageHelper')}</p>
        <Select
          id="language"
          value={selectedLanguage}
          onChange={(v) => setSelectedLanguage(v)}
          options={LANGUAGE_OPTIONS}
          aria-label={t('preferences.languageAria')}
        />
      </div>

      <div>
        <label htmlFor="number_format" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          {t('preferences.numberFormatLabel')}
        </label>
        <p className="text-sm text-text-muted mb-3">{t('preferences.numberFormatHelper')}</p>
        <Select
          id="number_format"
          value={numberFormat}
          onChange={(v) => setNumberFormat(v)}
          options={NUMBER_FORMAT_OPTIONS}
          aria-label={t('preferences.numberFormatAria')}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? t('preferences.saving') : t('preferences.save')}
        </button>
      </div>
    </form>
  )
}
