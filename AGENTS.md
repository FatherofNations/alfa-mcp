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

Maintain the public MCP API, resource names and prompt argument schemas. Keep knowledge, prompt text, generated checklists and templates consistent. Run npm test and the workflow contract tests. Do not copy private project artifacts into this repository.
