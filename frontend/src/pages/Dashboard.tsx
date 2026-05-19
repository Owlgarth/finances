import { useNavigate } from 'react-router-dom'
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext'
import Loading from '../components/common/Loading'
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

  if (isLoading) return <Loading />

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
