---
name: frontend-slides
description: Create polished fixed-stage HTML presentations and optionally export supported elements to editable PPTX.
---

# Frontend Slides

Use the repository's original HTML-first presentation workflow for visual
design, style discovery, and browser review. Keep slides at `1920x1080` and
use the root `SKILL.md`, `STYLE_PRESETS.md`, `html-template.md`, and
`viewport-base.css` when those files are available.

When the user needs an editable PowerPoint, continue with the companion
`html-to-editable-ppt` Skill:

1. Mark important elements with stable `data-pptx-id` values.
2. Measure browser-rendered HTML into JSON.
3. Export the supported subset as native PPTX objects.
4. Render and inspect the PPTX.
5. After manual PPTX edits, import it back to HTML and continue from recovered
   IDs.
6. Before export or delivery, run `node scripts/html_content_qa.mjs <deck.html> --strict` to catch broken rendered wraps and incomplete quantitative reasoning chains.

Do not claim that arbitrary CSS effects or screenshots are fully editable.

Keep the audience and main conclusion explicit. Label current capability,
target capability, estimates, simulations, and physical acceptance separately;
tests and renders are evidence, not flight or production proof. For PPTX
delivery, run structural QA and render every slide for visual checks of
clipping, overlap, crop quality, and readability.
