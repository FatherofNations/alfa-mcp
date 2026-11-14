# Tables
Extract column boundaries, header/body differences, row heights, borders, padding and alignment from structured design data.
Build a source text matrix, retaining NBSP, thin spaces, true minus signs, currency spacing and decimal separators.
Check first, representative middle and final rows; then verify every repeated row against the shared rule.
Use actual header/body geometry instead of assuming identical widths. Preserve intended zebra and grouped-row rules.
Keep data in typed arrays and render with stable row IDs. Do not replace exact strings with locale formatting unless it matches the design.
Check long content, alignment and clipping after the correct font loads.

