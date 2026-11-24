import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Circle, ListChecks, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { reportsApi, transactionsApi } from '../../api/client'
import { useBudgets } from '../../hooks/useDomain'
import { usePermissions } from '../../hooks/usePermissions'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { PAGE_SIZE_OPTIONS } from '../../utils/pageSize'
import { controlHeightClass, iconButtonClass } from '../common/formStyles'

// The dismissal is a per-workspace stored preference, like the per-budget view
// preferences elsewhere: a new workspace starts with the checklist visible.
const dismissedKey = (workspaceId: number) => `owlgarth_setup_checklist_dismissed:${workspaceId}`

function readDismissed(workspaceId: number): boolean {
  try {
    return localStorage.getItem(dismissedKey(workspaceId)) === '1'
  } catch {
    // Storage unavailable (private mode, quota): the checklist simply shows.
    return false
  }
}

// A line can be judged only once its query settled: data decides the tick and
// an error reads as unticked. Until all three settle the card stays out of the
// tree, so a complete workspace never flashes unticked lines on a cold load.
const isSettled = (query: { isSuccess: boolean; isError: boolean }) => query.isSuccess || query.isError

interface ChecklistRowProps {
  done: boolean
  to: string
  todoLabel: string
  doneLabel: string
}

function ChecklistRow({ done, to, todoLabel, doneLabel }: ChecklistRowProps) {
  return (
    <li>
      <Link
        to={to}
        className={`flex items-center gap-2 px-1.5 -mx-1.5 rounded-sm hover:bg-surface-hover transition-colors ${controlHeightClass}`}
      >
        <span className="w-3.5 shrink-0 flex items-center justify-center" aria-hidden="true">
          {done ? (
            <Check size={14} strokeWidth={1.5} className="text-positive" />
          ) : (
            <Circle size={14} strokeWidth={1.5} className="text-text-muted" />
          )}
        </span>
        <span className={`min-w-0 flex-1 truncate text-sm ${done ? 'text-text-muted' : 'text-text'}`}>
          {done ? doneLabel : todoLabel}
        </span>
        <ChevronRight size={14} strokeWidth={1.5} className="text-text-muted shrink-0" aria-hidden="true" />
      </Link>
    </li>
  )
}

function SetupChecklistCard({ workspaceId }: { workspaceId: number }) {
  const { t } = useTranslation('dashboard')
  const { canWrite } = usePermissions()
  // The card subscribes to the keys the Home widgets already read, so it adds
  // no request: the widgets and the card share each cache entry.
  const balances = useQuery({
    queryKey: ['current-balances', false],
    queryFn: () => reportsApi.currentBalances(false),
  })
  const budgets = useBudgets(false)
  const recent = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => transactionsApi.getAll({ ordering: '-date', page_size: PAGE_SIZE_OPTIONS[0] }),
  })
  // Read once per mount. The card is keyed on the workspace id (see the
  // wrapper below), so a workspace switch re-reads the next workspace's flag.
  const [dismissed, setDismissed] = useState(() => readDismissed(workspaceId))

  if (!canWrite || dismissed) return null
  if (!isSettled(balances) || !isSettled(budgets) || !isSettled(recent)) return null

  const hasAccount = (balances.data?.accounts.length ?? 0) > 0
  const hasBudget = (budgets.data?.length ?? 0) > 0
  // total is the count the list endpoint reports; items is the fallback for a
  // response that omits it.
  const hasTransaction = recent.data ? recent.data.total > 0 || recent.data.items.length > 0 : false
  if (hasAccount && hasBudget && hasTransaction) return null

  const handleDismiss = () => {
    // State first: the card hides for this session even when storage is
    // unavailable and the write below throws.
    setDismissed(true)
    try {
      localStorage.setItem(dismissedKey(workspaceId), '1')
    } catch {
      // Storage unavailable: hiding for this session is enough.
    }
  }

  return (
    <div className="bg-surface border border-border rounded-sm p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-medium text-text flex items-center gap-2">
          <ListChecks size={14} strokeWidth={1.5} aria-hidden="true" /> {t('setup.title')}
        </h3>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t('setup.hide')}
          className={iconButtonClass}
        >
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <ul>
        <ChecklistRow
          done={hasAccount}
          to="/accounts"
          todoLabel={t('setup.account.todo')}
          doneLabel={t('setup.account.done')}
        />
        <ChecklistRow
          done={hasBudget}
          to="/budgets"
          todoLabel={t('setup.budget.todo')}
          doneLabel={t('setup.budget.done')}
        />
        <ChecklistRow
          done={hasTransaction}
          to={hasTransaction ? '/transactions' : '/new'}
          todoLabel={t('setup.transaction.todo')}
          doneLabel={t('setup.transaction.done')}
        />
      </ul>
    </div>
  )
}

export default function SetupChecklist() {
  const { workspace } = useWorkspace()
  const workspaceId = workspace?.id
  // The stored dismissal is read once per mount, so the card mounts only once
  // the workspace is known and keyed on its id: a workspace switch remounts it
  // and reads the next workspace's flag instead of keeping the previous one.
  if (workspaceId == null) return null
  return <SetupChecklistCard key={workspaceId} workspaceId={workspaceId} />
}
