import { useNavigate } from 'react-router-dom'
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext'
import Skeleton, { SkeletonRows } from '../components/common/Skeleton'
import EmptyState from '../components/common/EmptyState'
import BalanceSection from '../components/balance/BalanceSection'
import PeriodHeader from '../components/dashboard/PeriodHeader'
import BudgetHealthWidget from '../components/dashboard/BudgetHealthWidget'
import FrequentSpendingWidget from '../components/dashboard/FrequentSpendingWidget'
import UpcomingPlannedWidget from '../components/dashboard/UpcomingPlannedWidget'
import ExchangeActivityWidget from '../components/dashboard/ExchangeActivityWidget'

export default function Dashboard() {
  const navigate = useNavigate()

  const { selectedPeriod: period, isLoading } = useBudgetPeriod()

  if (isLoading) {
    return (
      <div className="max-w-screen-2xl mx-auto space-y-4">
        <div className="bg-surface border border-border rounded-sm p-4">
          <Skeleton className="h-5 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="bg-surface border border-border rounded-sm p-4">
          <SkeletonRows count={2} className="space-y-4" rowClassName="h-16 w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-border rounded-sm bg-surface p-4">
              <Skeleton className="h-4 w-32 mb-3" />
              <SkeletonRows count={3} rowClassName="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!period) {
    return (
      <EmptyState
        message="No active budget period found for today's date."
        action={{ label: "View All Periods", onClick: () => navigate('/budget-periods') }}
      />
    )
  }

  return (
    <div className="max-w-screen-2xl mx-auto">
      <PeriodHeader period={period} />
      <BalanceSection periodId={period.id} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BudgetHealthWidget periodId={period.id} />
        <FrequentSpendingWidget periodId={period.id} />
        <UpcomingPlannedWidget />
        <ExchangeActivityWidget periodId={period.id} />
      </div>
    </div>
  )
}
