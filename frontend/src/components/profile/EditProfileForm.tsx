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
      return // No changes to submit
    }

    onSubmit(changedData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-2">
          Full Name
        </label>
        <input
          type="text"
          id="full_name"
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-colors"
          placeholder="Enter your full name"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
          Email Address
        </label>
        <input
          type="email"
          id="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-colors"
          placeholder="Enter your email address"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}