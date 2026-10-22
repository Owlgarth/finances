import { useEffect, useId, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { useMediaQuery } from '../../hooks/useMediaQuery'

interface InfoHintProps {
  /** Hint prose shown in the bubble. Plain text only - the bubble renders no markup. */
  text: string
  /** Accessible name for the "?" button, e.g. "About lead days". Defaults to text. */
  ariaLabel?: string
}

// Only one hint may be pinned at a time: pinning a hint closes whichever hint
// another instance had pinned. Holds that other instance's close function.
let closeOpenHint: (() => void) | null = null

export default function InfoHint({ text, ariaLabel }: InfoHintProps) {
  // Hover keys on hover capability, not pointer coarseness: hybrid devices
  // (touchscreen laptops) are both. Gating the mouse handlers in JS means a
  // tap's sticky synthetic hover can never wedge the bubble open on touch.
  const hoverCapable = useMediaQuery('(hover: hover)')
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  const visible = pinned || hovered || keyboardFocus

  const wrapperRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const bubbleId = useId()

  useEffect(() => {
    if (!pinned) return
    // Single open: release whichever hint another instance had pinned.
    closeOpenHint?.()
    const close = () => setPinned(false)
    closeOpenHint = close

    // Outside tap is touch's dismissal path: the toggle button handles taps
    // on itself, everything else closes.
    const handlePointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setPinned(false)
    }
    // Capture phase + stopPropagation: the hint claims the Escape key before
    // the modal's bubble-phase document listener (useOverlay) sees it, so the
    // first Escape closes only the hint and the next one closes the modal.
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setPinned(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeydown, true)
    // The mobile bottom sheet is a capped scroll container: scroll the
    // minimum needed to reveal the bubble instead of clipping it. A no-op
    // wherever nothing scrolls.
    bubbleRef.current?.scrollIntoView({ block: 'nearest' })

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeydown, true)
      // Covers closing/unmounting the whole modal while this hint is pinned
      // (and another hint having since taken over the slot).
      if (closeOpenHint === close) closeOpenHint = null
    }
  }, [pinned])

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => {
        if (hoverCapable) setHovered(true)
      }}
      onMouseLeave={() => {
        if (hoverCapable) setHovered(false)
      }}
    >
      <button
        type="button"
        aria-label={ariaLabel ?? text}
        aria-expanded={pinned}
        aria-describedby={bubbleId}
        onClick={() => setPinned(v => !v)}
        onFocus={(e) => {
          // :focus-visible does not match pointer taps, so a touch
          // tap-focus never stacks the focus bubble on the click toggle.
          if (e.currentTarget.matches(':focus-visible')) setKeyboardFocus(true)
        }}
        onBlur={() => setKeyboardFocus(false)}
        // Negative vertical margins cancel the padding's share of the layout
        // height so the icon fits inside the label's line box: a hint must
        // never grow its label row, or its input drops below its neighbor's.
        className="inline-flex items-center justify-center p-1 -my-1 pointer-coarse:p-2 pointer-coarse:-my-2 rounded-none text-text-muted hover:text-text transition-colors touch-hit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        <HelpCircle size={13} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {/* Always mounted (opacity, never display) so aria-describedby resolves
          and screen readers announce the hint together with the button.
          pointer-events-none lets taps pass through to the input beneath. */}
      <span
        ref={bubbleRef}
        role="tooltip"
        id={bubbleId}
        className={`absolute left-0 top-full mt-1 z-tooltip w-max max-w-[240px] bg-text text-surface rounded-sm px-2 py-1.5 text-[11px] font-normal leading-relaxed transition-opacity duration-100 pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        {text}
        <span
          aria-hidden="true"
          className="absolute -top-1 left-2 border-l-[4px] border-r-[4px] border-b-[4px] border-l-transparent border-r-transparent border-b-text"
        />
      </span>
    </span>
  )
}
