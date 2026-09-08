---
name: html-to-editable-ppt
description: Build or convert fixed-stage HTML presentations into native editable PowerPoint files, import basic PPTX edits back to HTML, and verify round-trip fidelity.
---

# HTML to Editable PPTX

Use this Skill when a user wants to keep frontend-style HTML as the design
surface but needs a native PowerPoint deliverable whose supported text, images,
shapes, lines, and tables remain editable.

## Workflow

1. Lock the audience, page count, content source, visual direction, and editability target.
2. Keep the HTML stage fixed at `1920x1080` and give editable elements stable `data-pptx-id` values.
3. Run `scripts/dom_to_schema.mjs` to measure the browser-rendered DOM. The JSON schema is the interchange layer, not a second hand-maintained design file.
4. Run `scripts/schema_to_pptx.mjs` to create native PPTX text boxes, images, shapes, lines, SVG assets, and notes.
5. Render and inspect the PPTX before delivery.
6. When a human edits the PPTX, run `scripts/pptx_to_html.py` to recover supported objects into a new HTML canvas. Review the import report before asking an agent to continue editing.

## Stability rules

- Do not regenerate unrelated slides when changing one slide.
- Keep shared title, page number, logo, and footer roles in a master/layout layer when possible.
- Never match elements by position alone. Use `data-pptx-id` in HTML and shape names or alt metadata in PPTX.
- Do not claim arbitrary CSS is editable. Unsupported effects must become an image fallback or an explicit warning.
- Preserve SVG icons as SVG in HTML. The PPTX path may embed them as vector images or rasterize them when the target library cannot preserve the SVG.
- Keep source claims, assets, and notes; do not invent evidence during conversion.

## Commands

```bash
node scripts/dom_to_schema.mjs <deck.html> <deck-schema.json>
node scripts/schema_to_pptx.mjs <deck-schema.json> <deck.pptx>
python scripts/pptx_to_html.py <edited.pptx> <html-output-dir>
node scripts/roundtrip_check.mjs <deck.html> <work-dir>
```

Use the original Frontend Slides Skill for visual style discovery and HTML
authoring. Use this Skill for the native-PPTX and round-trip stages.
