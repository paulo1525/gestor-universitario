/* Loading between routes: just the app background, no spinner or visible copy.
   The label is kept for screen readers only. */
export function QuietLoading({ label }: { label: string }) {
  return <main className="auth-loading" aria-busy="true"><span className="sr-only" role="status">{label}</span></main>;
}
