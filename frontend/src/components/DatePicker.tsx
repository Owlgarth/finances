import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { format, parse } from 'date-fns'
import 'react-day-picker/style.css'
import { useUserPreferences } from '../contexts/UserPreferencesContext'

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
  required?: boolean
  disabled?: boolean
  id?: string
  placeholder?: string
}

export default function DatePicker({
  value,
  onChange,
  className = '',
  required = false,
  disabled = false,
  id,
  placeholder = 'Select date',
}: Props) {
  const { calendarStartDay } = useUserPreferences()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isoToJsWeekday = (isoDay: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 => {
    return (isoDay === 7 ? 0 : isoDay) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  }

  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined

  const handleDaySelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'))
      setIsOpen(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  const handleClickOutside = (event: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
      setIsOpen(false)
    }
  }

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        id={id}
        value={value}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        className={`bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all ${className}`}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        readOnly
      />
      {isOpen && (
        <div 
          className="absolute z-50 mt-2 bg-surface-container-lowest rounded-xl p-4"
          style={{ boxShadow: 'var(--shadow-float)' }}
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDaySelect}
            weekStartsOn={isoToJsWeekday(calendarStartDay)}
            defaultMonth={selectedDate}
          />
        </div>
      )}
    </div>
  )
}
