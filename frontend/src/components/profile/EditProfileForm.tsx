import { useState } from 'react'
import type { User } from '../../types'

interface Props {
  user: User
  onSubmit: (data: { full_name?: string; email?: string }) => void
  isLoading: boolean
}

export default function EditProfileForm({ user, onSubmit, isLoading }: Props) {
  const [formData, setFormData] = useState({
    full_name: user.full_name || '',
    email: user.email || ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const changedData: { full_name?: string; email?: string } = {}

    if (formData.full_name !== user.full_name) {
      changedData.full_name = formData.full_name
    }

    if (formData.email !== user.email) {
      changedData.email = formData.email
    }

    if (Object.keys(changedData).length === 0) {
      return
    }

    onSubmit(changedData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="full_name" className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-2">
          Full Name
        </label>
        <input
          type="text"
          id="full_name"
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
          placeholder="Enter your full name"
        />
      </div>

      <div>
        <label htmlFor="email" className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-2">
          Email Address
        </label>
        <input
          type="email"
          id="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
          placeholder="Enter your email address"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2.5 text-on-primary rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary-container focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium bg-gradient-to-br from-primary to-primary-dim active:scale-[0.98]"
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
