import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

interface AccountMenuContextValue {
  /** Requests the account menu sheet to open. Safe to call on any surface;
      the sheet itself only mounts in the phone layout. */
  open: () => void
  /** Monotonic open-request counter. The sheet's render-adjust turns a
      new value into its own open state. */
  openTick: number
}

const AccountMenuContext = createContext<AccountMenuContextValue | null>(null)

/**
 * Account-menu reachability for surfaces far from the sheet itself (the
 * bottom bar's More tab, page headers). The provider mounts above the
 * layout's phone/desktop branch so every surface can open the menu and
 * the context identity survives viewport branch swaps; the sheet consumes
 * openTick and owns its own open state.
 */
export function AccountMenuProvider({ children }: { children: ReactNode }) {
  const [openTick, setOpenTick] = useState(0)
  const open = useCallback(() => setOpenTick((tick) => tick + 1), [])
  const value = useMemo(() => ({ open, openTick }), [open, openTick])
  return <AccountMenuContext.Provider value={value}>{children}</AccountMenuContext.Provider>
}

export function useAccountMenu(): AccountMenuContextValue {
  const context = useContext(AccountMenuContext)
  if (!context) throw new Error('useAccountMenu requires AccountMenuProvider')
  return context
}
