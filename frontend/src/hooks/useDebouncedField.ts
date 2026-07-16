import { useEffect, useRef, useState } from 'react'

/**
 * Draft state for a text input whose committed value lives elsewhere (URL
 * search params): keystrokes update the draft immediately, `onCommit` fires
 * after `delay` ms of quiet. External value changes (back button, "Clear
 * filters") reset the draft — but our own commits echoing back don't, so a
 * commit can never clobber characters typed while it was in flight.
 */
export function useDebouncedField(
  value: string,
  onCommit: (next: string) => void,
  delay = 300,
): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value)
  const lastCommitted = useRef(value)

  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])

  // External change (not our own echo) → adopt it.
  useEffect(() => {
    if (value !== lastCommitted.current) {
      lastCommitted.current = value
      setDraft(value)
    }
  }, [value])

  useEffect(() => {
    if (draft === lastCommitted.current) return
    const t = setTimeout(() => {
      lastCommitted.current = draft
      onCommitRef.current(draft)
    }, delay)
    return () => clearTimeout(t)
  }, [draft, delay])

  return [draft, setDraft]
}
