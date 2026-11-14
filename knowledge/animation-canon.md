# Motion implementation
## Establish the source
Use explicit user direction, then authored Figma motion, then an approved reference, then project defaults. Recipes are optional.
When reproducing Figma motion, inspect actual tool availability and load the Figma motion implementation guide if available. Fetch get_motion_context alongside get_design_context; reuse cached complete responses. Missing motion data is not proof that an interactive prototype has no transitions.
Preserve supplied keyframes, easing, units, per-element origins and coordinated timelines. Match exact node IDs first; use fallback IDs only when needed, scoped to the actual instance. Report unsupported tracks.

## Write the motion contract
For each interaction record trigger, semantic participants, source/target states, property tracks, units, easing, duration, delay, coordinate system, clipping, layering, interruption policy and reduced-motion result.
Separate authored values from proposed values. For scroll motion record scroll container, start/end positions, pin/release rules and reverse behavior.
A static frame cannot specify choreography. Choose restrained defaults for authorized unspecified motion, label them as proposals, and ask only if the missing choice materially changes the result.

## Implement
Use the project's existing animation engine. Keep one owner per animated property. Do not introduce a second engine on the same element.
Keep layout transforms on a wrapper and motion on an inner element. Preserve static transforms and origins; do not add an absolute rotation twice.
Use stable semantic IDs, never word equality or array position to infer shared-element identity.
Do not stretch glyphs, icons or images with independent scaleX/scaleY unless distortion is explicitly intended. Use uniform media scaling, container resizing, clipping or a text crossfade.
Keep state in React. Prefer reusable components and scoped refs over global DOM queries and copied DOM trees.
Use actual completion signals and cancellation cleanup; timeout is only a bounded recovery path, not the primary animation clock.
Define rapid-input behavior explicitly: retarget continuously, or finish current and run latest. Do not silently queue every stale request.
Wait for required fonts/images before measurements; invalidate measurements on resize and content changes.
For overlays, preserve focus, stacking, clipping and scroll ownership. If a snapshot-to-live handoff is necessary, test immediately before, at and after it.
Reduced motion must show a valid final state and preserve navigation; hiding or revealing all inactive panes is not a fallback.

## Validate
Prototype one representative transition before duplicating.
Sample 0/25/50/75/100 percent plus event boundaries using the engine's controllable clock. For scroll motion set exact scroll positions in both directions.
Then watch real-time playback: rhythm, trajectory, legibility, overlap, deformation, end velocity and handoff.
Exercise rapid reversal, repeated targets, resize, slow assets, unmount and reduced motion.
Endpoint equality and smooth frame cadence are necessary evidence for some claims, but neither proves good choreography.

