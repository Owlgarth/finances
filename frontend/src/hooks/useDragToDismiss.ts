import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

// Gesture tuning. Every motion here stays inside the 200ms design ceiling: the
// dismiss continuation re-uses the sheet's 80ms ease-in exit curve and the
// settle re-uses its 120ms ease-out entrance curve (the design motion
// contract's exit/entrance easings).
const AXIS_SLOP_PX = 8 // intent threshold before the axis lock commits
const DISMISS_DISTANCE_RATIO = 0.25 // release past 25% of panel height closes
const DISMISS_VELOCITY_PX_PER_MS = 0.5 // or a downward flick >= 500 px/s closes
const DISMISS_MS = 80 // ease-in continuation to translateY(100%)
const SETTLE_MS = 120 // ease-out settle back to rest
const EASE_IN = 'cubic-bezier(0.4, 0, 0.2, 1)' // exits
const EASE_OUT = 'cubic-bezier(0.32, 0.72, 0, 1)' // entrances
const SAFETY_MS = 200 // transitionend backstop; also the motion ceiling
const VELOCITY_WINDOW_MS = 100 // samples older than this carry no velocity
const SAMPLE_KEEP_MS = 150 // velocity sample buffer retention
const PANEL_TOP_BAND_PX = 96 // handle band plus a typical header row
const INTERACTIVE_SELECTOR = 'input, textarea, button, select, a, [contenteditable="true"]'

interface UseDragToDismissOptions {
  /** The translating element: the sheet panel, which is also the scroll container. */
  panelRef: RefObject<HTMLDivElement | null>
  /**
   * Called when the dismiss transition finishes, not at the moment of release:
   * the caller's `open -> false` starts the sheet's 80ms unmount hold, and
   * firing it at release would race that hold against the still-running slide.
   */
  onClose: () => void
  /** Master gate (open plus not-reduced-motion). Flipping false cancels an in-flight gesture. */
  enabled: boolean
}

interface VelocitySample {
  y: number
  t: number
}

interface Gesture {
  pointerId: number
  startX: number
  startY: number
  /** True once the vertical axis lock has committed. */
  locked: boolean
  /** True once a release path owns the panel (a settle or dismiss transition). */
  released: boolean
  /** Recent pointer positions for the release-velocity computation. */
  samples: VelocitySample[]
  /**
   * Detaches everything the gesture registered: window listeners, the panel
   * transitionend listener, the backstop timer. Idempotent.
   */
  end: () => void
}

/**
 * Vertical drag-to-dismiss for the mobile bottom sheet, armed from two
 * surfaces: a touch-action-none handle band (the guaranteed touch surface -
 * touch drags can only start where the browser pan cannot steal them) and,
 * for mouse/pen pointers, the top band of the panel itself. The panel is its
 * own scroll container, so the gesture only arms while the panel is scrolled
 * to the top - content scrolling always wins.
 *
 * The panel is moved imperatively (style.transform), never through React
 * state: per-frame writes stay cheap and never fight the style prop, which
 * only ever manages maxHeight/padding on this element.
 */
export function useDragToDismiss({ panelRef, onClose, enabled }: UseDragToDismissOptions) {
  const [dragging, setDragging] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Latest-callback ref (the useOverlay pattern) so the gesture never calls a
  // stale close handler when the caller passes a fresh closure per render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const gestureRef = useRef<Gesture | null>(null)

  // Open/close resets ride the enabled flip. On (re)open, any drag residue is
  // cleared so the entrance keyframe owns the panel again. When enabled flips
  // false mid-gesture (the sheet closed under the finger, or the OS
  // reduced-motion setting turned on), a finger-held gesture ends where it
  // stands - styles are left alone, freezing the panel where the drag left
  // it; a released gesture (settle or dismiss transition in flight) is left
  // to its own completion, which clears up after itself.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    if (enabled) {
      panel.style.transition = ''
      panel.style.transform = ''
      return
    }
    const gesture = gestureRef.current
    if (gesture && !gesture.released) {
      gesture.end()
      gestureRef.current = null
    }
  }, [enabled, panelRef])

  // Unmount mid-gesture (navigation under an open sheet): no dangling handlers.
  useEffect(() => () => gestureRef.current?.end(), [])

  const arm = (e: ReactPointerEvent<HTMLDivElement>, fromHandle: boolean) => {
    // Refuse while a gesture or one of its release transitions is in flight,
    // so a re-grab cannot fight the running animation.
    if (!enabled || gestureRef.current) return
    const panel = panelRef.current
    if (!panel || panel.scrollTop > 0) return
    if (!fromHandle) {
      // The panel surface serves mouse/pen pointers only: a touch on the
      // panel body belongs to the browser pan (the panel scrolls, the gesture
      // dies at pointercancel) - the handle band is the touch surface.
      if (e.pointerType === 'touch') return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest(INTERACTIVE_SELECTOR)) return
      if (e.clientY - panel.getBoundingClientRect().top > PANEL_TOP_BAND_PX) return
    }

    const gesture: Gesture = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      locked: false,
      released: false,
      samples: [],
      end: () => {},
    }
    let safety: number | undefined
    let onEnd: ((ev: TransitionEvent) => void) | null = null

    const detachWindow = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    gesture.end = () => {
      window.clearTimeout(safety)
      if (onEnd) panel.removeEventListener('transitionend', onEnd)
      detachWindow()
    }

    const finishSettle = () => {
      if (gestureRef.current !== gesture) return
      // Clean element so the next gesture starts from scratch.
      panel.style.transition = ''
      panel.style.transform = ''
      gesture.end()
      gestureRef.current = null
      setDragging(false)
    }

    const finishDismiss = () => {
      if (gestureRef.current !== gesture) return
      gesture.end()
      gestureRef.current = null
      // Terminal state: the exit keyframe stays suppressed while the panel
      // parks off-screen through the unmount hold, and the close fires only
      // now that the slide has completed.
      setDismissed(true)
      setDragging(false)
      onCloseRef.current()
    }

    const startTransition = (transform: string, duration: number, easing: string, finish: () => void) => {
      onEnd = (ev: TransitionEvent) => {
        if (ev.propertyName !== 'transform') return
        finish()
      }
      panel.addEventListener('transitionend', onEnd)
      safety = window.setTimeout(finish, SAFETY_MS)
      // Declaration order matters: the transition must be active before the
      // transform changes, or no transition runs.
      panel.style.transition = `transform ${duration}ms ${easing}`
      panel.style.transform = transform
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== gesture.pointerId) return
      const dx = ev.clientX - gesture.startX
      const dy = ev.clientY - gesture.startY
      if (!gesture.locked) {
        if (Math.hypot(dx, dy) < AXIS_SLOP_PX) return
        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal intent (rows and swipes keep their surface): end with
          // no visual change.
          gesture.end()
          gestureRef.current = null
          return
        }
        gesture.locked = true
        setDragging(true)
      }
      // Downward only; upward drags clamp at rest.
      panel.style.transition = 'none'
      panel.style.transform = `translateY(${Math.max(0, dy)}px)`
      gesture.samples.push({ y: ev.clientY, t: ev.timeStamp })
      while (gesture.samples.length > 0 && ev.timeStamp - gesture.samples[0].t > SAMPLE_KEEP_MS) {
        gesture.samples.shift()
      }
    }

    const releaseVelocity = (now: number) => {
      const samples = gesture.samples
      const last = samples[samples.length - 1]
      // A hold-then-release must not fling: stale samples carry no velocity.
      if (!last || now - last.t > VELOCITY_WINDOW_MS) return 0
      let first = last
      for (const sample of samples) {
        if (now - sample.t <= VELOCITY_WINDOW_MS) {
          first = sample
          break
        }
      }
      const dt = last.t - first.t
      if (dt <= 0) return 0
      return (last.y - first.y) / dt
    }

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== gesture.pointerId) return
      gesture.released = true
      if (gesture.locked) {
        // A drag that ends off-panel still synthesizes a click on the wrapper
        // (the nearest common ancestor of the down and up targets); swallow
        // it for the rest of this task, or a drag that only re-positioned
        // the sheet would close it through the scrim-tap path.
        const swallowClick = (click: MouseEvent) => {
          click.stopPropagation()
          click.preventDefault()
        }
        window.addEventListener('click', swallowClick, true)
        window.setTimeout(() => window.removeEventListener('click', swallowClick, true), 0)
      }
      const dy = ev.clientY - gesture.startY
      const dismiss =
        dy >= panel.offsetHeight * DISMISS_DISTANCE_RATIO ||
        releaseVelocity(ev.timeStamp) >= DISMISS_VELOCITY_PX_PER_MS
      if (dismiss) {
        startTransition('translateY(100%)', DISMISS_MS, EASE_IN, finishDismiss)
      } else {
        startTransition('translateY(0px)', SETTLE_MS, EASE_OUT, finishSettle)
      }
      // The release path belongs to the transition now; window listeners go.
      detachWindow()
    }

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== gesture.pointerId) return
      gesture.released = true
      // The browser took the pointer (scroll steal): settle, no velocity credit.
      startTransition('translateY(0px)', SETTLE_MS, EASE_OUT, finishSettle)
      detachWindow()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    gestureRef.current = gesture
  }

  // Fast-reopen self-heal (actual-vs-desired, the useDelayedUnmount open-path
  // pattern): a reopen inside the exit window must clear drag-dismiss residue -
  // the terminal off-screen state and the suppressed keyframe - or the sheet
  // would remount invisible. Loop-safe by construction: each write lands on a
  // value that disproves the guard.
  if (enabled && (dismissed || dragging)) {
    setDismissed(false)
    setDragging(false)
  }

  return {
    handleProps: {
      onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
        // Keep the panel surface below from double-arming this pointer.
        e.stopPropagation()
        arm(e, true)
      },
    },
    panelProps: {
      onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => arm(e, false),
    },
    dragging,
    dismissed,
  }
}
