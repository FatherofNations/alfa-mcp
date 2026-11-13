# Design-system integration
Match the exact design font by region, including weight, line height and letter spacing. Do not force Alfa Sans over Styrene or another authored font.
If the user chooses a brand-normalized mode, document every substitution and recheck wrapping, clipping and baseline geometry. Do not claim literal pixel parity.
Use bundled fonts only when they match the chosen mode. If the font is unavailable, report it; do not silently substitute.
Reuse existing core-ds components when their version, variant and token values match the design. Inspect installed exports/theme before selecting imports.
Keep original glyphs, masks, effective fills and alpha. Use the original asset provenance workflow for provenance.
Map Figma variable aliases and modes explicitly. Preserve region-specific typography and semantic tokens.
Use next/font/local or @font-face according to the project's architecture; neither is a universal requirement. Verify actual loaded faces before QA.
Keep business data outside presentational components. Avoid overriding a library component until its relevant props/tokens have been inspected.

