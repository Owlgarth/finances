import { useEffect, useState } from 'react'

/**
 * Height of the on-screen keyboard overlapping the layout viewport.
 * iOS doesn't resize the layout viewport for the keyboard, so a bottom-fixed
 * sheet would sit behind it; visualViewport tells us how much to lift.
 */
export function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    if (!vv) return
    const update = () =>
      setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setInset(0)
    }
  }, [active])

  return inset
}
