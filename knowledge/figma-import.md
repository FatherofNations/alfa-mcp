# Read the design once, preserve its provenance
Parse file and node IDs from the user's link. Inspect available Figma tools and their schemas; do not assume desktop/remote feature parity.
Load the provider's required design-to-code instructions before calling its design-context tool.
Start with get_design_context for the requested frame. Use metadata to navigate or split incomplete responses, not as a compulsory duplicate request.
Get variables and a reference screenshot. Retrieve original images and vectors with available export tools; respect the actual per-node/batch API schema.
Save complete responses keyed by file/node/version/options, plus source timestamps and asset provenance. Refresh only changed or missing data.
Never silently accept truncated output. Split by meaningful children and merge the inventory.
If Code Connect hides required geometry, inspect the mapped component and available raw-context options; do not assume a flag exists.
For each unresolved value, query the exact node, component definition or matching version of the design-system source. A neighboring component is evidence only if its relevant properties match.
Screenshots are visual references, not an exact source of numeric geometry. Label approximations and obtain a decision when accuracy would materially change.
Download expiring assets promptly. Do not crop a screenshot to replace an available source asset.
For authored animation call get_motion_context when available, preserve node IDs and timeline groups, then use alfa://knowledge/animation-canon. Interactive variant flows may require separate state modeling.
Continue unaffected sections if one node is blocked; clearly report the unresolved part.

