import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

/** Editable targets a step-drag must never claim: a horizontal drag inside
 *  a text field is caret movement or selection, not a page step. */
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]'

/** Mutable per-gesture state; lives in a ref so a mid-gesture re-render
 *  (query refetch) never restarts or double-fires the gesture. */
interface DragState {
  pointerId: number
  startX: number
  startY: number
  /** Axis decision: null until |dx| or |dy| passes the slop, then 'x'
   *  (locked horizontal) or 'dead' (vertical led - native scroll wins). */
  axis: null | 'x' | 'dead'
  /** One step per gesture: set when onStep fires; further moves are inert
   *  until the next pointerdown re-arms the gesture. */
  stepped: boolean
}

export interface HorizontalStepDragOptions {
  /** Fired once per gesture when |dx| crosses the threshold with the
   *  dominant axis horizontal. dir = sign of the horizontal delta
   *  (drag right = +1 = next, matching the right chevron's geometry). */
  onStep: (dir: 1 | -1) => void
  /** Horizontal travel (CSS px) that fires the step. Default 48 - over
   *  the 44px coarse hit floor, short enough to feel immediate. */
  threshold?: number
  /** Axis-lock slop (CSS px): sub-slop movement stays undecided; a
   *  vertical lead past it kills the gesture so vertical scrolling
   *  always wins. Default 10. */
  slop?: number
  /** Pointer gate: when false every handler is a no-op (taps and the
   *  trailing click pass through untouched). Coarse-only gating
   *  (useIsTouch) lives at the call site, matching SwipeRow's contract. */
  enabled?: boolean
  /** setPointerCapture keeps the move/up stream when the finger slides
   *  off the target, and retargets the trailing click to the target -
   *  exactly right for a leaf target like the stepper label. Pass false
   *  when the target WRAPS nested interactive elements (the budget page's
   *  content block): capture would retarget their taps' clicks to the
   *  wrapper and silently break cards and links. */
  pointerCapture?: boolean
}

export interface HorizontalStepDragHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
}

/** Horizontal step-drag: dragging sideways past a threshold fires onStep
 *  exactly ONCE per gesture, however far the drag continues; re-arming
 *  requires a new gesture (a fresh pointerdown). The step fires at
 *  threshold crossing (instant, no travel animation - nothing here
 *  animates, so prefers-reduced-motion needs no gate; the gesture itself
 *  still works under reduced motion). The host MUST also carry the
 *  `touch-pan-y` class: it hands vertical panning to the browser
 *  (pointercancel then aborts the gesture) while keeping horizontal moves
 *  for us - without it, touch browsers may cancel the pointer stream on
 *  any pan start and the drag never fires.
 *
 *  Coarse pointers only, by the host's `enabled` (useIsTouch). Taps are
 *  unaffected: only a threshold-crossing drag installs the click swallow.
 *
 *  A stepped drag's trailing click is eaten by a transient window-capture
 *  swallow (removed on the next macrotask), never a sticky flag: real
 *  touch input pipelines synthesize no trailing click for drags, so a
 *  flag that only resets on the next pointerdown would stay armed and eat
 *  the next keyboard activation (Tab + Enter) of a control on the host.
 *
 *  Adoption contract: the calendar feature reuses this hook for its grid
 *  and day list - a horizontal swipe steps the month/week/day through the
 *  same handler as that view's arrows. Do not specialize this hook for
 *  the calendar; parametrize at the call site. */
export function useHorizontalStepDrag({
  onStep,
  threshold = 48,
  slop = 10,
  enabled = true,
  pointerCapture = true,
}: HorizontalStepDragOptions): HorizontalStepDragHandlers {
  const stateRef = useRef<DragState | null>(null)

  // The browser synthesizes the drag's trailing click (if it synthesizes
  // one at all) in the same input turn as the release, so a one-shot
  // window-capture listener removed on the next macrotask eats exactly
  // that click and nothing else - a click that arrives later (keyboard
  // Enter on the host) can never collide with it.
  const swallowTrailingClick = () => {
    const swallow = (click: MouseEvent) => {
      click.stopPropagation()
      click.preventDefault()
    }
    window.addEventListener('click', swallow, true)
    window.setTimeout(() => window.removeEventListener('click', swallow, true), 0)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || !e.isPrimary || e.button !== 0) return
    if ((e.target as HTMLElement | null)?.closest(EDITABLE_SELECTOR)) return
    stateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      axis: null,
      stepped: false,
    }
    if (pointerCapture) e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const s = stateRef.current
    if (!s || e.pointerId !== s.pointerId || s.stepped || s.axis === 'dead') return
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    if (s.axis === null) {
      if (Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx)) {
        s.axis = 'dead'
        return
      }
      if (Math.abs(dx) <= slop) return
      s.axis = 'x'
    }
    if (Math.abs(dx) >= threshold) {
      s.stepped = true
      onStep(dx > 0 ? 1 : -1)
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const s = stateRef.current
    if (!s || e.pointerId !== s.pointerId) return
    if (s.stepped) swallowTrailingClick()
    stateRef.current = null
  }

  const onPointerCancel = (e: ReactPointerEvent<HTMLElement>) => {
    // pointercancel (the browser took the gesture for scrolling) is never
    // followed by a click, so it never arms the swallow.
    const s = stateRef.current
    if (!s || e.pointerId !== s.pointerId) return
    stateRef.current = null
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}
