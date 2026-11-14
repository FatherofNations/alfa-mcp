# State in URLs
Define a typed mapping of supported URL parameters to UI state. Parse and validate unknown/invalid values safely.
Use the router/history API appropriate to the installed Next.js version; do not ban useSearchParams universally.
Choose push versus replace according to intended back-button behavior and preserve unrelated parameters.
Apply URL-derived state through the same state model as user interactions. Do not trigger redundant intro animations during hydration.
Test a direct URL, reload, back/forward and invalid parameters, not only an already-open page.
Do not serialize secrets or transient animation frame positions in URLs.

