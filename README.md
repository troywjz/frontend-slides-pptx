# Frontend Slides PPTX

HTML-first presentation authoring with an editable PowerPoint round trip. The project keeps slide layout maintainable for AI agents while preserving native PPTX objects for human editing.

The previous full README is preserved at [README_FULL.md](README_FULL.md). Conversion details are in [docs/HTML_TO_EDITABLE_PPTX.md](docs/HTML_TO_EDITABLE_PPTX.md).

## Workflow

1. **Start from an existing PPTX when available.** Import it to fixed-stage HTML and keep rendered slide images as the visual baseline. Review `import-report.json`; preserve unsupported or already-approved slides in the source deck instead of forcing a lossy round trip.
2. **Start directly in HTML when no PPTX exists.** Use a fixed 1920 x 1080 stage, native HTML/CSS/SVG, `data-pptx-element`, and stable `data-pptx-id` values.
3. **Design and revise in HTML.** Keep repeated titles, footers, colors, spacing, and component geometry in shared code. Render every slide after each material revision.
4. **Export native editable PPTX.** Measure the DOM, generate the element schema, then build PowerPoint objects.
5. **Verify before delivery.** Run structural QA and inspect a full rendered montage plus critical slides at original resolution. For partial redesigns, merge the exported slides into the source deck and pixel-check the untouched pages.
6. **Continue after human PowerPoint edits.** Import the edited PPTX back to HTML through stable IDs, review the import report, and reconcile unsupported effects before the next export.

```bash
# Existing PPTX -> HTML
python scripts/pptx_to_html.py input.pptx work/imported

# HTML -> editable PPTX
node scripts/dom_to_schema.mjs work/deck.html work/deck.schema.json
node scripts/schema_to_pptx.mjs work/deck.schema.json work/deck.pptx

# Structural checks
node scripts/pptx_qa.mjs inspect work/deck.pptx
node scripts/pptx_qa.mjs qa work/deck.pptx
```

Codex entry points: `frontend-slides-pptx:frontend-slides` for HTML slide authoring and `frontend-slides-pptx:html-to-editable-ppt` for editable PPTX conversion and round-trip work.

---

# Frontend Slides PPTX 中文指南

本项目采用 HTML 优先的演示文稿工作流：AI 主要维护 HTML，人类继续使用 PowerPoint 微调，最终文件保留原生可编辑元素。

完整旧版 README 保存在 [README_FULL.md](README_FULL.md)，转换约束见 [docs/HTML_TO_EDITABLE_PPTX.md](docs/HTML_TO_EDITABLE_PPTX.md)。

## 使用流程

1. **已有 PPTX：**先转为固定画布 HTML，同时保留逐页渲染图作为视觉基线。检查 `import-report.json`；导入不完整或已经确认的页面继续保留在原 PPT 中，避免强行往返造成失真。
2. **没有现有 PPTX：**直接从 1920 x 1080 固定画布 HTML 开始，使用 HTML/CSS/SVG、`data-pptx-element` 和稳定的 `data-pptx-id`。
3. **在 HTML 中完成设计与修改：**统一管理标题、页脚、颜色、间距和组件尺寸，每次重要修改后重新渲染全部页面。
4. **导出可编辑 PPTX：**测量 DOM，生成元素模型，再写入 PowerPoint 原生对象。
5. **交付前验证：**执行结构检查，查看整套缩略图，并以原始分辨率检查关键页。局部改造时，把新页面合入源 PPT，并对未修改页面进行像素比对。
6. **人工修改后继续：**将改过的 PPTX 再导回 HTML，通过稳定 ID 恢复可支持的修改，根据导入报告处理未支持效果，再继续由 Agent 修改和导出。
