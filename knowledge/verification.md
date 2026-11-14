# Three independent verification tracks
Record commit, route, viewport, DPR, browser, font readiness, assets and state for every result.
1. Static: source-derived geometry including inner boxes; original assets; exact text; expected font actually loaded; native-size element screenshots; full-frame comparison.
2. Interaction: real pointer and keyboard actions, both directions, deep links, focus, scroll, disabled states and rapid requests. Synthetic dispatch is a diagnostic, not proof that a user can click through overlays.
3. Motion: source/contract coverage, deterministic intermediate samples, event boundaries, real-time playback, interruption, resize, slow loading, unmount and reduced motion.

Inspect what npm run verify actually asserts. Missing Playwright, fixtures, font expectations or motion references means NOT CHECKED, not PASS.
Run verify with the actual explicit URL. Confirm route identity before trusting results.
Wait for document.fonts.ready and required image decoding. Check declared families AND font loading; a CSS family string alone does not prove the font rendered.
Do not globally disable animations for motion QA. For static QA, explicitly seek or set the intended resting state, then measure. animation:none can leave hidden or incorrect states.
Do not assume headless animations are frozen. Inspect actual currentTime, playState and advancement.
CSS getComputedStyle timings do not cover arbitrary JS animation engines. Use their timeline APIs, computed output and visual evidence.
Use the motion contract's sample times plus handoff boundaries; compare against independent reference states, not generated implementation output.
Record all known defects, missing coverage and accepted deviations. A build pass is only a build pass.
Run appropriate lint/types/build and existing regression checks. A reusable new checker needs positive and negative cases.
For local toolkit commands inspect --help for geomdiff, elparity, parity and checklist; do not claim they ran merely because a checklist was printed.

