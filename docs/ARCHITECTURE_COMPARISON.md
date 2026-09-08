# HTML to Editable PPTX: Architecture Decision

## Decision

Use the existing Frontend Slides HTML workflow as the authoring surface, a
measured JSON element model as the interchange layer, PPTXGenJS for native
forward export, and `python-pptx` for the supported reverse import.

## Comparison

| Area | PPTXGenJS | `html-to-editable-ppt` reference | Decision |
| --- | --- | --- | --- |
| Forward export | Strong JavaScript integration and native text/shapes/images/notes | Clear schema router and hybrid/image strategies | Use PPTXGenJS behind the schema; keep the router contract |
| Browser layout fidelity | Does not measure the browser by itself | Uses a schema rather than arbitrary DOM measurement | Measure DOM in Playwright before export |
| Editability | Native PowerPoint objects for supported types | Native objects for schema types; screenshot fallback for the rest | Prefer native objects; warn on unsupported effects |
| Reverse conversion | No built-in PPTX to HTML round trip | Python importer is a useful portable reference, not a full inverse | Use `python-pptx` importer with stable IDs and reports |
| QA | Rendering is external to the library | Explicit render and QA workflow | Keep round-trip smoke tests and render inspection |
| Maintenance | Same JS/HTML ecosystem as the existing project | Separate Python schema/export workflow | Keep the boundary at JSON to avoid duplicating design logic |

## Preserved

- Existing HTML-first visual design and style discovery.
- Fixed `1920x1080` measurement stage.
- Screenshot/hybrid fallback for visuals that cannot safely become native
  PowerPoint objects.
- Stable element IDs, roles, slide notes, and source assets.

## Boundary

Arbitrary CSS, animations, SmartArt, embedded media, and every SVG path cannot
be losslessly represented as independent PowerPoint objects. The converter
supports the common editable subset and reports the rest; it does not silently
label a screenshot as fully editable.
