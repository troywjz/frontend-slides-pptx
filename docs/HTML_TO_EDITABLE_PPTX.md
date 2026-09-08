# HTML to Editable PPTX

This fork adds a constrained, testable bridge between the Frontend Slides HTML
canvas and native PowerPoint objects.

## Why this architecture

The project keeps Frontend Slides as the design surface and uses a measured DOM
schema as the boundary between browser layout and PowerPoint. PPTXGenJS is the
native export engine because it stays in the existing JavaScript toolchain and
can create editable text, shapes, images, SVG graphics, notes, and slide-level
metadata. The JSON schema is independent of PPTXGenJS so another renderer can
be added later without changing the HTML contract.

The public `html-to-editable-ppt` project is a useful reference for its explicit
deck schema, element router, hybrid fallback, and render/QA workflow. Its
Python implementation is a good reverse-import foundation, but its forward
path is schema-driven rather than a general browser-DOM converter. This fork
combines the two strengths: browser measurement and native JavaScript export
for the forward path, plus a Python reverse importer for the portable subset.

## Supported contract

HTML slides should use a fixed `1920x1080` stage. Elements that should become
native PPTX objects receive `data-pptx-element` and a stable `data-pptx-id`.
Use `data-pptx-type` for `text`, `rect`, `card`, `line`, `image`, `svg`, or
`table`.

Example:

```html
<section class="slide" data-slide data-slide-id="slide-01">
  <div data-pptx-element data-pptx-id="slide-01-title"
       data-pptx-role="title">A real editable title</div>
  <svg data-pptx-element data-pptx-id="slide-01-icon"
       data-pptx-type="svg" viewBox="0 0 24 24"><path d="..." /></svg>
</section>
```

## Commands

Install optional conversion dependencies:

```bash
cd packages/html-to-editable-pptx
npm install
npx playwright install chromium
pip install -r ../../requirements-html-to-editable-pptx.txt
```

Measure HTML and create the intermediate model:

```bash
node scripts/dom_to_schema.mjs decks/example/index.html build/deck-schema.json
```

Create native PPTX objects:

```bash
node scripts/schema_to_pptx.mjs build/deck-schema.json build/deck.pptx
```

Import a manually edited PPTX back to an editable HTML canvas:

```bash
python scripts/pptx_to_html.py build/deck.pptx build/imported-html
```

Run the complete smoke round trip:

```bash
node scripts/roundtrip_check.mjs decks/example/index.html build/roundtrip
```

## Fidelity boundary

Text, images, simple shapes, lines, tables, stable IDs, and basic styling are
routed to editable PPTX objects. Inline SVG is preserved as an SVG graphic in
the PPTX and as an image when imported back to HTML; its internal paths are not
split into separate PowerPoint shapes yet. Complex CSS effects, animations,
SmartArt, embedded media, and unsupported SVG paths may be preserved as images
or reported as unsupported. The converter must fail with a warning rather than
silently claim that an unsupported element is editable.

The practical contract is: every element marked for export, or automatically
recognized as a common visible text/media/painted box, is routed through the
editable subset. Arbitrary CSS is not promised to become native PowerPoint
objects.
