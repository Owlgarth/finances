// "Disable zoom" (More sheet): kills double-tap and pinch zoom for a closer-to-
// native feel. A device preference, not an account one — stored client-side like
// 'denarly_theme', never synced: you want it on the phone, not the desktop.
const STORAGE_KEY = 'denarly_disable_zoom'

// Must match the viewport meta in index.html.
const BASE_VIEWPORT = 'width=device-width, initial-scale=1.0, viewport-fit=cover'

export function isZoomDisabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

/** Applies the stored/new preference to the live page. Safe to call repeatedly. */
export function applyZoomLock(disabled: boolean) {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      'content',
      disabled ? `${BASE_VIEWPORT}, maximum-scale=1.0, user-scalable=no` : BASE_VIEWPORT,
    )
  // iOS Safari ignores user-scalable=no; touch-action on the root is what
  // actually removes double-tap/pinch zoom there. Panning (scroll) still works.
  document.documentElement.style.touchAction = disabled ? 'pan-x pan-y' : ''
}

export function setZoomDisabled(disabled: boolean) {
  localStorage.setItem(STORAGE_KEY, String(disabled))
  applyZoomLock(disabled)
}
