# Project structure
Keep app/ for routing and layouts; components/ for semantic UI; data/ for demo content; lib/ for behavior and pure helpers; styles/ for tokens and scoped styles; public/assets/ for source exports.
Keep qa/figma source responses separate from qa expectations and QA results. Record current decisions in HANDOFF.
Build new pages in native JSX/TSX. Keep legacy HTML extraction only where migration requires it.
Keep interaction state close to its owner. Separate static layout wrappers from motion layers.
Use reusable semantic components such as hero title, media and CTA. Do not infer identity from matching words.
Read existing package scripts, imports and installed framework documentation before adding files.

