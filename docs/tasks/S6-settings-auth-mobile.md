# S6 — Settings/Profile + auth + legal mobile pass

Size **S** (audited down from M) · Deps: M2 · Plan: `IMPLEMENTATION_PLAN.md`

## Audit result
Most of this pass was already covered by the primitives: profile section modals present as
sheets (M2), inputs render 16px on mobile (M1), buttons have the 44px floor (M7), Login/
Register are centered `max-w-md` cards with `px-4` gutters, legal pages are `max-w-3xl` prose
with responsive gutters — all fine at 375px as-is.

## Changes (`ProfilePage.tsx`)
- Tab nav buttons (Profile/Password/Security/Preferences/Account): `max-sm:min-h-[44px]`
  (were ~41px); the existing `flex-wrap` handles the 2-row wrap at 375px.
- Tab panel `p-6` → `p-6 max-sm:p-4` (content breathing room at 375px without double gutters).

## Done
375px: all five profile tabs tappable at 44px; 2FA setup, recovery codes (2-col grid fits),
legacy import, delete/reset flows all usable in sheets; register → login single-column with
no zoom-on-focus. Lint + build clean.
