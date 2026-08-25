/**
 * Licence attribution (see LICENSE in the repo root): any deployment visible to
 * anyone other than the operator must display this notice, reachable from every
 * main screen. Do not remove. The notice line must stay verbatim, with the URL
 * as an active link.
 */
export default function AttributionFooter() {
  return (
    <footer className="mt-8 pt-4 border-t border-border">
      <p className="text-xs text-text-muted">
        Powered by Owlgarth Finances -{' '}
        <a
          href="https://owlgarth.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary-hover"
        >
          https://owlgarth.com
        </a>
      </p>
    </footer>
  )
}
