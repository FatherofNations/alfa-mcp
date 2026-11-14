# Visual fidelity
Use three complementary checks after each meaningful section:
- geometry, including inner boxes;
- native-size element comparison for text, icons, fills and effects;
- whole-frame comparison for composition and regression trends.
Match viewport, DPR, browser, font files/weights, zoom and UI state. Preserve reference scale; do not resize images until they appear similar.
Keep expected results from Figma separate from browser observations.
Investigate the shared source of a mismatch before patching every child.
Font rasterization can differ across renderers; document the environment and any justified tolerance. Do not promise identical pixels across arbitrary OS/browser combinations.
Set or seek an explicit resting state for static capture. Do not infer that headless playback is frozen.
For motion use alfa://knowledge/animation-canon: final screenshots cannot validate intermediate movement.

