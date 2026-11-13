# React ownership and lifecycle
Build new prototypes with native JSX/TSX components and explicit props/state. Preserve design geometry, not serialized HTML bytes.
Use Server Components for static content where appropriate and small Client Components for interaction. Inspect installed Next.js documentation before version-specific changes.
Use stable semantic keys. Keep layout and animation transforms on separate elements. Scope imperative engines to refs.
Initialize effects from stable data and current measured geometry. Cleanup listeners, observers, timers, frames and animations; setup-cleanup-setup must be safe.
Do not hardcode a mutated DOM snapshot to compensate for incorrect cleanup.
Use memo only for measured performance needs; correctness must survive a re-render.
For legacy HTML migration, isolate the injected subtree, define who owns mutations, and migrate incrementally. Never assume memo guarantees DOM preservation.
Compare geometry, computed styles and screenshots after migration; outerHTML equality is not a visual fidelity test.
Render fixed dialogs through an appropriate portal outside transformed ancestors; preserve focus, Escape, scroll lock and restoration.
Define animation interruption, asset readiness, resize and reduced-motion handling before adding a transition.
Do not rewrite a whole working page merely to change one animation; extract the smallest stable component boundary.

