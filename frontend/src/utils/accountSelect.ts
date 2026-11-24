/** Sentinel Select value for "no account" - the shared Select cannot hold a
 * null-valued option, and 0 can never collide with a real account id.
 * Shared by every form that lets a record stay account-less (the dedup
 * rule: copy at two, extract at three). */
export const NO_ACCOUNT = 0

/** Resolve a Select's numeric value to the account id it means (null when the
 * sentinel is picked). */
export function resolveAccountId(value: number): number | null {
  return value === NO_ACCOUNT ? null : value
}
