import { useTranslation } from 'react-i18next'
import AccountsWidget from '../components/dashboard/AccountsWidget'
import BudgetWidget from '../components/dashboard/BudgetWidget'
import UpcomingWidget from '../components/dashboard/UpcomingWidget'
import RecentActivityWidget from '../components/dashboard/RecentActivityWidget'
import PageHeader from '../components/layout/PageHeader'

export default function Dashboard() {
  const { t } = useTranslation('dashboard')
  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <PageHeader title={t('title')} showAccountActions />
      {/* Widget order: Accounts, Budget, Upcoming, Recent. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AccountsWidget />
        <BudgetWidget />
        <UpcomingWidget />
        <RecentActivityWidget />
      </div>
    </div>
  )
}
