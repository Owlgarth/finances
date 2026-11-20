import { useEffect, useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Scroll memory for the 640-1023 band, where the <main> element owned by
 *  MainLayout is the scroll container. A route swap replaces the content
 *  inside <main>, and the browser clamps scrollTop when the new page is
 *  shorter - without an explicit save, Back lands at the clamped offset,
 *  not where the user left the list. Mirrors MainLayout's private
 *  useMobileScrollRestoration (the <640 window-scroll twin, keyed by
 *  pathname): save continuously while mounted, restore on pathname
 *  change. The map is module-level so the save (list page) and the
 *  restore (the list's next mount) survive the route components'
 *  remounts. Reached by document query - MainLayout exports no handle
 *  and renders exactly one <main> element. */
const positions = new Map<string, number>()

export function useMainScrollRestoration(enabled: boolean) {
  const location = useLocation()

  useEffect(() => {
    if (!enabled) return
    const main = document.querySelector('main')
    if (!main) return
    const save = () => positions.set(location.pathname, main.scrollTop)
    main.addEventListener('scroll', save, { passive: true })
    return () => main.removeEventListener('scroll', save)
  }, [enabled, location.pathname])

  useLayoutEffect(() => {
    if (!enabled) return
    const main = document.querySelector('main')
    if (main) main.scrollTop = positions.get(location.pathname) ?? 0
  }, [enabled, location.pathname])
}
