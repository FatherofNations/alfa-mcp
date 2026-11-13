# Prototype implementation policy

Follow the user's explicit requirements and existing project decisions. Do not ask again for a chosen stack, authorized implementation detail, or accepted deviation.
For new Alfa prototypes, default to Next.js App Router, React and TypeScript; preserve an existing stack unless migration is requested.
Use the exact design font, weights, assets and geometry. Brand substitutions require an explicit project decision and must be recorded as deviations.
Treat Figma structure and motion as separate inputs. Figma MCP supplies design data; this toolkit supplies workflow and helpers, not an automatic Figma compiler.
Use design context first; metadata is for navigation or incomplete/truncated responses. Discover actual tool capabilities rather than assuming transport-specific features.
Use native React components for new interfaces. HTML injection is a bounded legacy migration technique, not the default architecture.
Use motion sources in this order: explicit user direction, authored Figma motion, approved reference, documented project defaults.
Presets are optional starting points. Never invent motion on a node when reproducing authored motion.
Validate static fidelity, functional behavior and motion quality separately. A passing build or matching endpoint is not proof of motion quality.
Keep original source data, implementation assumptions and QA evidence separate. Never derive expected geometry from the implementation under test.
Report missing coverage honestly. Do not publish or change access settings unless authorized.

## Read only the current stage
Use read_knowledge when resource URIs are unavailable.
- figma-import: structure, motion and assets.
- design-system, pixel-perfect, table-import: exact static implementation.
- react-patterns, animation-canon: component ownership and choreography.
- verification: independent static, behavior and motion evidence.
- stack-choice, project-structure, tools-panel, deep-links, deploy-vercel: only as needed.

Figma get_motion_context is a provider capability, not a tool implemented by this server. Inspect availability before using it.
add_animation returns optional CSS presets, not an authored motion specification or a quality verdict.
In command mode helper output is a proposed command/content, not proof that files were written.
Changing this repository does not update an already running MCP deployment or an installed local skill bundle.
