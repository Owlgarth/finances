import { useEffect, useRef, type FocusEvent } from 'react'

// An error stays hidden until a field's first invalid blur. A blur that a
// button caused is not one: pressing Add, Cancel or a panel's Close is the
// button's own action. Add shows every error through the submit, and Cancel
// must leave a pristine form without an error row that would move the
// button under the pointer between the press and the release. Two paths
// count as a button's: focus moving onto a button (Tab, or a press in a
// browser that focuses buttons), and a press that started on a button (in
// a browser that does not focus them, the blur carries no related target).
export function useButtonBlurGuard() {
  const pressedButtonRef = useRef(false)
  useEffect(() => {
    const mark = (e: PointerEvent) => {
      pressedButtonRef.current =
        e.target instanceof Element && e.target.closest('button') !== null
    }
    document.addEventListener('pointerdown', mark, true)
    return () => document.removeEventListener('pointerdown', mark, true)
  }, [])
  return (e: FocusEvent<HTMLElement>): boolean => {
    const fromPress = pressedButtonRef.current
    pressedButtonRef.current = false
    const next = e.relatedTarget
    return fromPress || (next instanceof Element && next.closest('button') !== null)
  }
}
