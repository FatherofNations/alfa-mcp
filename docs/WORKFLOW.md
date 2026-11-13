# Workflow update
This revision changes agent guidance and future scaffold behavior. It does not migrate existing prototypes or install client skills automatically.

- Default new interactive projects to Next.js; honor explicit and existing stack choices.
- Use original fonts; record deliberate brand substitutions separately.
- Use native JSX for new pages. Legacy HTML injection remains a bounded migration option.
- Read authored Figma motion when available and describe choreography before implementation.
- Treat CSS recipes as optional defaults.
- Test static fidelity, behavior and motion separately.
- New template font checks use qa/fonts.json with route (optional), selector and family. Missing expectations are NOT CHECKED; provide rules for every relevant text region.
- The motion contract validator checks structure, not browser behavior or visual quality.
- Existing recipes remain API-compatible; existing project animation runtimes are not rewritten by this update.
- A repository change is not an installed client update or a deployed MCP server update.
