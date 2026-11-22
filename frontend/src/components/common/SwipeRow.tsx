import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { hasActiveOverlay } from '../../hooks/useOverlay'

export interface SwipeRowAction {
  /** Stable per-row key (also the button's data-swipe-action marker). */
  key: string
  /** Visible button text - already translated by the caller. */
  label: string
  icon: LucideIcon
  /** Delete-style actions render in text-negative (the ActionSheet convention). */
  destructive?: boolean
  onSelect: () => void
}

interface SwipeRowProps {
  /**
   * Coarse-pointer + write-permission gate from the page (useIsTouch() &&
   * canWrite, plus per-row eligibility). false renders the children
   * unwrapped: fine pointers get no swipe DOM, listeners or touch-action.
   */
  enabled: boolean
  /** 0-2 actions revealed by a left swipe; an empty array behaves like enabled=false. */
  actions: SwipeRowAction[]
  /** The row itself - keeps its own role/tabIndex/onClick (tappableProps). */
  children: ReactNode
}

// One open row at a time, app-wide. Single slot: rows are peers, never
// stacked (the overlay stack in hooks/useOverlay.ts degenerated to one
// entry). Claiming closes the previous occupant, which is also the
// close-on-opening-another-row behavior.
let closeOpenRow: (() => void) | null = null

// Gesture thresholds:
// - 10px movement before the axis is decided (below this, taps stay taps)
// - horizontal intent = |dx| beats |dy| by 1.5x ("clearly horizontal":
//   vertical or diagonal gestures lose and native scroll wins)
// - release past 50% of the action-tray width settles open (a FULL swipe
//   never fires anything - the offset clamps at the tray edge and only a
//   tap on a revealed button runs an action)
const AXIS_LOCK_PX = 10
const HORIZONTAL_BIAS = 1.5
const OPEN_FRACTION = 0.5

/**
 * Left-swipe action reveal for coarse-pointer list rows. The action tray
 * sits behind the row content as a SIBLING (never inside the row's button
 * role - a button may not descend from a button; interactive nesting is
 * invalid HTML and steals activation). Collapsed actions are inert: out of
 * the tab order and the a11y tree until revealed (translation alone does
 * not hide content from screen readers). The row's own activation
 * (tappableProps) is untouched. `touch-action: pan-y` on the surface is
 * what lets vertical scrolling stay native while horizontal drags stream
 * pointer events - do not remove it.
 *
 * A locked drag's trailing click is eaten by a transient window-capture
 * swallow (removed on the next macrotask), so keyboard activation of a
 * revealed button can never collide with a stale suppression flag.
 */
export default function SwipeRow({ enabled, actions, children }: SwipeRowProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<{
    id: number
    startX: number
    startY: number
    locked: null | 'x' | 'y'
    trayW: number
    base: number
  } | null>(null)

  const [dragging, setDragging] = useState(false)
  const [open, setOpen] = useState(false)
  // 0 = closed; negative while revealing. The committed state (not a ref
  // mirror) is the single source of truth: handlers re-bind every commit,
  // so each pointer event reads the offset the previous event wrote, and
  // render-phase closes stay legal (no ref writes outside handlers).
  const [offset, setOffset] = useState(0)

  const close = useCallback(() => {
    setOpen(false)
    setOffset(0)
  }, [])

  // Route change closes the open row (same-page param changes included; a
  // full route swap unmounts the list, and the open effect's cleanup
  // releases the registry slot). Render-adjust, not an effect: the state
  // write happens during the render that observes the new location.
  const location = useLocation()
  const [prevLocation, setPrevLocation] = useState(location)
  if (prevLocation !== location) {
    setPrevLocation(location)
    if (open) close()
  }
  // Self-heal when the surface stops being swipeable while revealed
  // (permission or row-eligibility flip): loop-safe by construction, each
  // write lands on a value that disproves the guard.
  if ((!enabled || actions.length === 0) && open) {
    close()
  }

  // Open-row lifecycle: claim the single slot (closing any other open row),
  // then close on outside pointerdown, on any list scroll (capture phase -
  // scroll events do not bubble), and on Escape when no overlay owns the key.
  useEffect(() => {
    if (!open) return
    closeOpenRow?.()
    closeOpenRow = close
    const onDocPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    const onDocScroll = () => close()
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || hasActiveOverlay()) return
      close()
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    document.addEventListener('scroll', onDocScroll, true)
    document.addEventListener('keydown', onKeydown)
    return () => {
      if (closeOpenRow === close) closeOpenRow = null
      document.removeEventListener('pointerdown', onDocPointerDown, true)
      document.removeEventListener('scroll', onDocScroll, true)
      document.removeEventListener('keydown', onKeydown)
    }
  }, [open, close])

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return // fine pointers have no swipe layer
    gestureRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      locked: null,
      trayW: trayRef.current?.offsetWidth ?? 0,
      base: offset,
    }
  }

  // A locked drag's trailing click would open the row it just swiped. The
  // browser synthesizes it (on the drag's common-ancestor target) in the
  // same input turn as the release, so a one-shot window-capture listener
  // removed on the next macrotask eats exactly that click - a sticky flag
  // would still be armed when a KEYBOARD activation (Tab + Enter on a
  // revealed button, no pointerdown to reset it) arrives later.
  const swallowTrailingClick = () => {
    const swallow = (click: MouseEvent) => {
      click.stopPropagation()
      click.preventDefault()
    }
    window.addEventListener('click', swallow, true)
    window.setTimeout(() => window.removeEventListener('click', swallow, true), 0)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current
    if (!g || e.pointerId !== g.id) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (g.locked === null) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      if (Math.abs(dx) > HORIZONTAL_BIAS * Math.abs(dy)) {
        g.locked = 'x'
        // Capture only once the gesture is ours: capturing earlier would
        // steal vertical scrolls that must stay native (touch-action:
        // pan-y hands those to the browser).
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
      } else {
        g.locked = 'y'
        return // native vertical scroll owns the rest
      }
    }
    if (g.locked !== 'x') return
    // Left reveal only; clamped at the tray width (full swipes never fire).
    setOffset(Math.max(-g.trayW, Math.min(0, dx + g.base)))
  }

  const settle = (trayW: number) => {
    const nextOpen = offset <= -(trayW * OPEN_FRACTION)
    setOpen(nextOpen)
    setOffset(nextOpen ? -trayW : 0)
    setDragging(false)
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current
    if (!g || e.pointerId !== g.id) return
    if (g.locked === 'x') {
      // The browser may already have reclaimed a cancelled pointer.
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      swallowTrailingClick()
      settle(g.trayW)
    }
    gestureRef.current = null
  }

  const handleClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (open && !(e.target as HTMLElement).closest('[data-swipe-action]')) {
      e.stopPropagation() // tapping the open row's content closes, never navigates
      close()
    }
  }

  if (!enabled || actions.length === 0) return <>{children}</>

  return (
    <div
      ref={rootRef}
      className="relative overflow-hidden select-none touch-pan-y"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClickCapture={handleClickCapture}
    >
      {/* Action tray: sibling BEHIND the row content (absolute + DOM order;
          no z tier). The outer shell spans the whole row so the buttons
          stretch to full row height (items-stretch); the inner flex is the
          measured tray - its intrinsic width is the reveal target and the
          clamp bound, NOT the full row width. Collapsed = inert: excluded
          from the tab order and the a11y tree. */}
      <div inert={!open} className="absolute inset-0 flex items-stretch justify-end">
        <div ref={trayRef} className="flex items-stretch">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              data-swipe-action={action.key}
              onClick={() => {
                // Close first, then run - the action may open a modal and
                // must not stack over a revealed tray.
                close()
                action.onSelect()
              }}
              className={`flex min-w-[72px] pointer-coarse:min-h-[44px] flex-col items-center justify-center gap-0.5 px-3 text-xs active:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus ${
                action.destructive ? 'text-negative' : 'text-text-muted'
              }`}
            >
              <action.icon size={14} strokeWidth={1.5} aria-hidden="true" />
              {action.label}
            </button>
          ))}
        </div>
      </div>
      {/* Row content: opaque so the tray stays hidden until revealed; paints
          above the tray by DOM order. Transition OFF while dragging (the
          finger drives the transform); the 100ms settle transition is
          presentation only and collapses to a snap under the GLOBAL
          prefers-reduced-motion rule at the bottom of index.css. */}
      <div
        className={`relative bg-surface ${dragging ? '' : 'transition-transform duration-100 ease-out'}`}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  )
}
