# Forms: Seams, Drafts and Multi-Step Flows

Part of the `frontend-react` skill. Read before changing form hooks, host-controlled form fields, localStorage drafts, or multi-step submit flows.

## Controlled-Override Seams on Form Hooks

Lifting single fields (amount, date) out of a form state machine - a page host rendering ONE shared amount/date row that feeds two form hooks - is the controlled-open idiom generalized to field values across a hook boundary. The hook stays the single source of truth per value; an optional `shared` seam per liftable field (`TransactionFormShared`) reconciles both directions, and the owning modal passes nothing so it is behaviorally unchanged by construction:

- **Internal writes report upward synchronously.** Rename ONLY the useState declaration's setter half (`setAmountState`), then define the merged const under the ORIGINAL name immediately after the state block, calling `shared?.onAmountChange(value)` after the state write - every internal call site (seeding, parse fill, resetForAnother, the returned object) resolves to the merged setter with zero further edits, and a byte-move extraction gate normalizes the rename away.
- **Explicit host values win downward via a value-compare render-adjust** on the hook's own state (skip when `shared === undefined` or the values already match) - loop-safe because each write lands on a value that disproves the guard, and StrictMode-idempotent for free.
- Carry the seam byte-identically on every hook of the family, so a future host can lift either form's rows without a second design. Exemplars: `hooks/useTransactionForm.ts` and `hooks/useTransferForm.ts` (consumer: `pages/NewTransactionPage.tsx`).
- **When a host takes over a concern, the child's duplicate machinery is gated off in the same change** - two owners of one concern double-fire with conflicting orderings. The `sharedFields` variant of the fields component keys error-display timing on the host's resettable `showAllErrors` latch and suppresses its submit-keyed focus effect (the host's focus tick owns focus). Exemplar: the `sharedFields`/`showAllErrors` props in `transactions/TransactionFormFields.tsx`.
- **When two seamed hooks session-seed during the SAME render pass, their upward reports append to ONE state queue and the LAST queued write wins - a host lifting a field re-asserts its seed BELOW every competing hook writer.** On a warm-cache mount (the external data already resolved), the page's copy seed and an always-mounted sibling hook's create-mode seeding both queue upward writes in one pass; the sibling's `setFromAmount('')` queues after the copy seed and the lifted amount lands empty. A lazy initializer alone loses the same race - the sibling's write still queues after it; the decisive piece is POSITION. The assert is a render-adjust placed below the last hook and every early return (its write is queued last and owns the queue), latched on the source OBJECT identity - the same trigger as the hook's own session re-seed - so typed edits, upward-reported parse fills, and the save-and-add-another reset are never re-applied. The latch initializes to null/sentinel, NEVER to the tracked value: initializing to the current source would suppress the mount-pass assert, which is exactly the pass the warm path needs. Exemplar: the copy-seed assert in `pages/NewTransactionPage.tsx` (`sharedAmount` lazy-seeded from `copySource`, `seededCopy` deliberately null-initialized). Needs NO assert in the contrast case: a repeat/copy seam whose seeding CLEARS the shared values (the transfer repeat zeroes the amount and re-dates) races an always-mounted sibling's create seeding that queues the SAME empty values - queue order is irrelevant because the competing writes are identical. The discriminator: assert only when the external seed writes a NON-empty value into a shared field, and state the reason in a comment at the gate so a later reader does not 'fix' the asymmetry. Exemplar pair in `pages/NewTransactionPage.tsx`: the transaction `?copy=` seam (non-empty seed, assert required) vs the `copy_transfer` repeat seam (clearing seed, none).

## Form Draft Persistence (localStorage)

Unsaved scalar form values on `/new` persist to localStorage behind `utils/formDraft.ts` - a module-closure controller, NOT a React ref or state mirror:

- **The controller is a plain module closure because the flush must serialize "latest values" from unmount cleanup.** `react-hooks/refs` (error) forbids ref writes during render and state dies with the component - the closure IS the store, updated only from user-action change handlers (debounced ~500ms writes plus an unmount-flush effect), so no effect ever reads React state to write the draft. Keys follow the app's `owlgarth_*` convention and scope per-user AND per-workspace (`owlgarth_formdraft_<userId>_<workspaceId>`): logout sweeps the user's keys before auth clears, and a workspace switch removes the old (user, workspace) draft from the switch handler's click-render closure, which holds the OLD workspace id by construction. Reads are 24h-gated with prune-on-read.
- **A generation guard closes the resurrection race.** Logout/switch remove the key directly, then `/new` unmounts and its cleanup calls `flush()` - without the guard the flush re-creates the draft the user just discarded and the next login restores it. External removal bumps a generation counter the flush checks; a `clear()`-initiated drop needs no bump (`dirty=false` already makes the flush a no-op).
- **Draft writes happen ONLY at user seams: wrap the hooks' RETURNED setters and patch the field handlers.** Internal machinery (seeding, `parse.onSuccess` fills, the prefill block, `resetForAnother`) keeps the raw setters - receipt-derived values and the post-save reset must never draft. Deliberately never drafted: the receipt File, parse state, line-item rows (absent from the draft-values type), and URL state.
- **Restore goes through SEEDING (the session render-adjust), never user-action handlers.** Restored values never mark `prefillTouched`, never draft themselves back, and land as the isDirty seed baseline - a restored-but-unedited form is correctly NOT dirty. Arrival adjusts carry explicit-choice guards: a draft carrying `accountId` (or either transfer end) made that pick EXPLICITLY, so the default re-derive must be suppressed or every cold mount re-picks over the restore; stale restored reference ids drop to null/derived, gated on the draft's presence so draft-free hosts keep today's behavior. The `draft`/`reseedNonce` hook options default to null/0 - a host passing neither gets identical behavior and byte-identical sessionKeys by construction (the nonce suffixes the session discriminator only when non-zero).
- **Sparse-draft reads test `dv?.field !== undefined`, never `??`.** Present-null is the ONLY representation of an explicit "no pick": `null ?? x` returns `x` and silently re-picks an account the user deliberately cleared.
- **Competing URL seeds win outright - the draft goes dormant under them.** Under `?copy=`/`?copy_transfer=` there is no key, no controller, no restore, no write, no delete: a copy draft would fight the copy-source seed, and query params (`type`, `account`, `copy`) always beat the draft.
- **A scoping key that resolves asynchronously must gate the seeding `open`.** `user` is guaranteed at mount (ProtectedRoute) but `workspace` resolves via query - without gating `open` on `workspace !== null`, the hooks seed on render 1 before the draft key exists and the restore can never land; with the gate, the active key, the memos, and the hooks' `open` all flip in the SAME render, so the first seeding pass holds the draft. Exemplars: `utils/formDraft.ts`, the draft block in `pages/NewTransactionPage.tsx`, the `draft`-threaded seeding in `hooks/useTransactionForm.ts`/`hooks/useTransferForm.ts`.

## Multi-Step UI Flows

Use a union-typed state machine with conditional rendering for multi-step flows (setup → verify → confirm):

```typescript
type SectionState = 'idle' | 'setup' | 'showing_codes' | 'disabling'
const [state, setState] = useState<SectionState>('idle')

if (state === 'showing_codes') return <RecoveryCodesDisplay ... />
if (state === 'setup' && setupData) return <SetupForm ... />

const mutation = useMutation({
  mutationFn: api.verifySetup,
  onSuccess: (data) => {
    setState('showing_codes')
    queryClient.invalidateQueries({ queryKey: ['status'] })
  },
})
```

**A long in-flight submit swaps the whole card body for a staged progress panel** - branch on `isSubmitting` (Register's "Setting up your workspace" checklist), never offer only a disabled button: a 2-5s synchronous request with no visible progress reads as a frozen UI. The swap never unmounts the component, so all form state stays alive and a failed submit restores the typed values for free, and the derived stage list is frozen mid-flight because the input that could change it (the sample-data checkbox feeding its conditional) is unmounted by the swap. Stages are pure client-side timers identical on every error path - backend state never leaks through stage count or timing - and the advance is capped (`Math.min(s + 1, setupStages.length - 1)`) so the terminal step stays "active" forever: it must never flip to complete while the request is still hanging. Exemplar: `pages/Register.tsx`.
