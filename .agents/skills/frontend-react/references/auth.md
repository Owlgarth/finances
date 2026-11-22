# Auth Flows

Part of the `frontend-react` skill. Read before touching login, token storage, the 401 refresh interceptor, return navigation after sign-in, or token-based verification pages.

## Auth Response Error Guard

Every auth function expecting an `access_token` must have an `else` branch showing an error toast when the token is missing - never silently do nothing on an unexpected response:

```typescript
if (response.access_token) {
  // ... existing success logic
} else {
  toast.error(t('errors.unexpectedResponse'))
  return
}
```

The toast message is UI text - the component has `useTranslation('auth')` in scope, and the key lives in the owning `auth` namespace.

## Token Storage

Access and refresh tokens are stored separately in `localStorage` (`owlgarth_token`, `owlgarth_refresh_token`). Helpers in `api/client.ts`: `setRefreshToken`, `getRefreshToken`, `clearAuthToken` (clears both tokens and the Authorization header).

All auth flows receiving token pairs (`login`, `register`, `verify2FA`) must store both tokens:

```typescript
if (response.access_token) {
  setAuthToken(response.access_token);
  if (response.refresh_token) {
    setRefreshToken(response.refresh_token);
  }
}
```

The `if (response.refresh_token)` guard matches the optional `refresh_token` field on `Token`, for endpoints that only return access tokens.

## 401 Interceptor with Token Refresh

The Axios response interceptor in `api/client.ts` uses a queue-based pattern:

1. On 401, check for a refresh token. If none, clear tokens and redirect to `/login`.
2. If a refresh is in progress (`isRefreshing`), queue the failed request in `failedQueue` and replay after refresh succeeds.
3. On refresh success, store the new token pair, replay queued requests, retry the original.
4. On refresh failure, clear both tokens, reject queued requests, redirect to `/login`.
5. Auth routes (`/login`, `/register`) are excluded from redirect to avoid loops.

`authApi.refresh` sends `{ headers: { Authorization: '' } }` to avoid sending the expired access token on the refresh request itself.

Credential endpoints (`login`, `register`, `verify2FA`, `refresh`) mark their requests `_skipAuthRefresh: true` - a wrong-credential 401 must reject immediately instead of entering the refresh path (a stale refresh token in storage would attempt a silent rotation and redirect to `/login`, swallowing the login form's own error toast). New credential-style endpoints (token exchange, magic-link consume) set the flag too.

**Post-Sign-In Return Navigation (router state):** an unauthenticated redirect from `ProtectedRoute` carries the protected location through router STATE (`state={{ from: location }}`), never a `?next=` query param - state is unbookmarkable/unshareable, so there is no open-redirect surface to guard. The sign-in page narrows it with a module-level helper (typeof-guarded, `'/'`-prefixed, rejecting protocol-relative `//` - RR7 types `location.state` as `any`) and its ALREADY-AUTHENTICATED guard performs the single post-auth navigation (`to={from ?? '/'} replace`) for both the login and 2FA success paths: a `setUser` re-render flips `isAuthenticated` and the guard fires. When a context's success path and a page's guard both navigate, delete the context's navigation in the same change - two owners of one concern double-fire with conflicting orderings (AuthContext's `navigate('/')` after `setUser` either clobbers or preempts the return navigation) - and funnel every success path through the one navigation owner. Accepted trade-off: post-sign-in navigation is `replace`, so Back no longer returns to the signed-out `/login` entry. Exemplars: `ProtectedRoute.tsx`'s redirect state, `returnToFromState` in `pages/Login.tsx`.

## Token-Based Verification Pages

```tsx
type State = 'loading' | 'success' | 'error'

export default function VerifyPage() {
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    const verify = async () => {
      const token = searchParams.get('token')
      if (!token) {
        setState('error')
        return
      }
      try {
        await authApi.verify(token)
        setState('success')
      } catch {
        setState('error')
      }
    }
    verify()
  }, [searchParams])
}
```

- Always handle the missing-token case (`if (!token)` → error state)
- Public verification pages go outside `ProtectedRoute`; authenticated pages inside it
- Public token pages must guard any authenticated follow-up call (e.g. `getCurrentUser()` refresh) with `if (getAuthToken())` - otherwise the 401 interceptor redirects anonymous visitors to `/login`, hiding the page's own success/error state
- Success states offer a navigation link; error states offer retry/resend
- Use a named `async` function inside `useEffect` with `try/catch/await` - no `.then()` chains
- Never show the same success state in both `try` and `catch` - add a distinct error state with a recovery path
