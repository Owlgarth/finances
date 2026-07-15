import { useEffect, useRef } from 'react'

// Overlays currently open, in mount order. Lets stacked overlays coordinate:
// Escape must close only the topmost one (e.g. a ConfirmDialog layered over a
// form modal — closing both would silently discard the form input).
const overlayStack: symbol[] = []

// Refcounted body scroll lock — with stacked overlays, the lock releases only
// when the last one closes. Remembers the pre-lock inline style once.
let lockCount = 0
let previousBodyOverflow = ''

/**
 * True while any blocking overlay (Modal/BottomSheet) is open. Lets non-blocking
 * poppers with their own document-level Escape listeners (WorkspaceSelector)
 * yield the key to the overlay stack instead of co-firing.
 */
export function hasActiveOverlay(): boolean {
  return overlayStack.length > 0
}

function acquireScrollLock() {
  if (lockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1
}

function releaseScrollLock() {
  lockCount -= 1
  if (lockCount === 0) {
    document.body.style.overflow = previousBodyOverflow
  }
}

/**
 * Shared behavior for blocking overlays (Modal, BottomSheet): stack-aware
 * Escape-to-close, refcounted body scroll lock, and focus capture/restore.
 * Attach the returned ref to the panel element (give it `tabIndex={-1}`).
 */
export function useOverlay(active: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)
  const id = useRef<symbol | null>(null)
  if (id.current === null) id.current = Symbol('overlay')

  // Keep the latest onClose without re-registering listeners each render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!active) return

    const self = id.current!
    overlayStack.push(self)
    acquireScrollLock()

    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (overlayStack[overlayStack.length - 1] !== self) return
      onCloseRef.current()
    }
    document.addEventListener('keydown', handleKeydown)

    return () => {
      document.removeEventListener('keydown', handleKeydown)
      const index = overlayStack.indexOf(self)
      if (index !== -1) overlayStack.splice(index, 1)
      releaseScrollLock()
      previouslyFocused?.focus()
    }
  }, [active])

  return panelRef
}
