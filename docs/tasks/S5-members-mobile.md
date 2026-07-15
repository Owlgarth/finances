# S5 — Members mobile pass

Size **M** · Deps: M3, M7 · Plan: `IMPLEMENTATION_PLAN.md`

## Objective
An owner can invite a member and change a role entirely from a phone. The page's dialogs
(add / edit role / reset password / change password) already present as sheets via M2's Modal;
the desktop table (4 columns, `px-6` cells) is the part that dies at 375px.

## Changes (`WorkspaceMembersPage.tsx`)
- **Adaptive list**: `useBreakpoint().isMobile` picks a card list over the table — one
  `MemberCard` per member: avatar, name (+You chip), email, role + status badges on a second
  line. The desktop `<table>`/`MemberRow` path is untouched.
- **Row actions**: card tap opens an `ActionSheet` (Edit role / Reset password / Remove —
  destructive) gated by the same per-member permission math the table row uses
  (`canEditThisMember`, `canResetPasswordFor`); cards without any permitted action aren't
  tappable.
- Header buttons already collapse to icons below `sm` (existing `hidden sm:inline` labels);
  they get 44px min-height on mobile.

## Done
375px: member list renders without horizontal scroll; tap a member → sheet → Edit role →
role Select (sheet) → save; Remove goes through the existing confirm dialog. Desktop table
pixel-identical. Lint + build clean.
