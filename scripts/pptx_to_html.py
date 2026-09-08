#!/usr/bin/env python3
"""Convert common native PPTX objects into editable fixed-stage HTML.

The importer intentionally targets the portable element subset used by the
HTML exporter. Unsupported PowerPoint objects are reported instead of being
silently rewritten as inaccurate HTML.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE


def rgb(value, fallback="#FFFFFF"):
    try:
        return f"#{value[0]:02X}{value[1]:02X}{value[2]:02X}" if value else fallback
    except Exception:
        return fallback


def safe_name(value: str, fallback: str) -> str:
    value = re.sub(r"[^A-Za-z0-9_.-]+", "-", value or "").strip("-")
    return value or fallback


def shape_metadata(shape):
    """Read stable metadata written to the DrawingML non-visual properties."""
    try:
        c_nv_pr = shape._element.find(".//{http://schemas.openxmlformats.org/presentationml/2006/main}cNvPr")
        if c_nv_pr is None:
            return {}
        descr = c_nv_pr.get("descr") or ""
        result = {}
        for item in descr.split(";"):
            key, separator, value = item.partition(":")
            if separator and key in {"data-pptx-id", "data-pptx-role"}:
                result[key] = value
        if not result.get("data-pptx-id"):
            name = c_nv_pr.get("name") or ""
            if name and not re.match(r"^(Text|Shape|Image) \d+$", name):
                result["data-pptx-id"] = name
        return result
    except Exception:
        return {}


def emu(value: int, total: int, pixels: int) -> float:
    return round(float(value) / float(total) * pixels, 2)


def shape_style(shape, slide_width, slide_height):
    left = emu(shape.left, slide_width, 1920)
    top = emu(shape.top, slide_height, 1080)
    width = emu(shape.width, slide_width, 1920)
    height = emu(shape.height, slide_height, 1080)
    return left, top, width, height


def fill_color(shape):
    try:
        if shape.fill.type is None:
            return None
        return rgb(shape.fill.fore_color.rgb, "#FFFFFF")
    except Exception:
        return None


def line_style(shape):
    try:
        if not shape.line or not shape.line.fill.type:
            return "none"
        return rgb(shape.line.color.rgb, "#111827")
    except Exception:
        return "none"


def text_element(shape, slide_width, slide_height, element_id):
    left, top, width, height = shape_style(shape, slide_width, slide_height)
    text = shape.text.strip()
    if not text:
        return ""
    font_size = 18
    font_name = "Aptos"
    bold = False
    italic = False
    color = "#111827"
    try:
        p = shape.text_frame.paragraphs[0]
        if p.runs:
            run = p.runs[0]
            font_size = round((run.font.size.pt if run.font.size else 18) * 1.333, 2)
            font_name = run.font.name or font_name
            bold = bool(run.font.bold)
            italic = bool(run.font.italic)
            color = rgb(run.font.color.rgb, color)
    except Exception:
        pass
    style = (
        f"left:{left}px;top:{top}px;width:{width}px;height:{height}px;"
        f"font-family:{html.escape(font_name)};font-size:{font_size}px;"
        f"color:{color};font-weight:{'700' if bold else '400'};"
        f"font-style:{'italic' if italic else 'normal'};white-space:pre-wrap;"
    )
    return f'<div data-pptx-element data-pptx-type="text" data-pptx-id="{html.escape(element_id)}" style="{style}">{html.escape(text)}</div>'


def shape_element(shape, slide_width, slide_height, element_id):
    left, top, width, height = shape_style(shape, slide_width, slide_height)
    fill = fill_color(shape) or "transparent"
    line = line_style(shape)
    style = f"left:{left}px;top:{top}px;width:{width}px;height:{height}px;background:{fill};border:1px solid {line if line != 'none' else 'transparent'};"
    return f'<div data-pptx-element data-pptx-type="rect" data-pptx-id="{html.escape(element_id)}" style="{style}"></div>'


def table_element(shape, slide_width, slide_height, element_id):
    left, top, width, height = shape_style(shape, slide_width, slide_height)
    rows = []
    for row in shape.table.rows:
        cells = "".join(f"<td>{html.escape(cell.text)}</td>" for cell in row.cells)
        rows.append(f"<tr>{cells}</tr>")
    style = f"left:{left}px;top:{top}px;width:{width}px;height:{height}px;"
    return f'<table data-pptx-element data-pptx-type="table" data-pptx-id="{html.escape(element_id)}" style="{style}">{"".join(rows)}</table>'


def extract_shape(shape, slide_width, slide_height, assets_dir, slide_index, element_index, warnings):
    metadata = shape_metadata(shape)
    element_id = safe_name(
        metadata.get("data-pptx-id") or shape.name,
        f"slide-{slide_index:02d}-element-{element_index:02d}",
    )
    role = metadata.get("data-pptx-role")
    if getattr(shape, "has_table", False):
        return table_element(shape, slide_width, slide_height, element_id)
    if shape.has_text_frame and shape.text.strip():
        element = text_element(shape, slide_width, slide_height, element_id)
        return element.replace(">", f' data-pptx-role="{html.escape(role)}">', 1) if role and element else element
    if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
        filename = f"slide-{slide_index:02d}-{element_id}.png"
        (assets_dir / filename).write_bytes(shape.image.blob)
        left, top, width, height = shape_style(shape, slide_width, slide_height)
        style = f"left:{left}px;top:{top}px;width:{width}px;height:{height}px;object-fit:fill;"
        role_attr = f' data-pptx-role="{html.escape(role)}"' if role else ""
        return f'<img data-pptx-element data-pptx-type="image" data-pptx-id="{html.escape(element_id)}"{role_attr} src="assets/{filename}" style="{style}" alt="{html.escape(element_id)}">'
    if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
        return "".join(extract_shape(child, slide_width, slide_height, assets_dir, slide_index, element_index, warnings) for child in shape.shapes)
    if shape.shape_type in {MSO_SHAPE_TYPE.AUTO_SHAPE, MSO_SHAPE_TYPE.FREEFORM, MSO_SHAPE_TYPE.LINE}:
        return shape_element(shape, slide_width, slide_height, element_id)
    warnings.append(f"slide {slide_index}: unsupported shape {shape.shape_type} ({shape.name})")
    return ""


def main():
    parser = argparse.ArgumentParser(description="Convert native PPTX objects to fixed-stage HTML.")
    parser.add_argument("pptx")
    parser.add_argument("output_dir")
    args = parser.parse_args()
    pptx_path = Path(args.pptx).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    assets_dir = output_dir / "assets"
    assets_dir.mkdir(exist_ok=True)
    prs = Presentation(pptx_path)
    slide_width = prs.slide_width
    slide_height = prs.slide_height
    warnings = []
    sections = []
    for slide_index, slide in enumerate(prs.slides, start=1):
        elements = []
        for element_index, shape in enumerate(slide.shapes, start=1):
            elements.append(extract_shape(shape, slide_width, slide_height, assets_dir, slide_index, element_index, warnings))
        notes = ""
        try:
            notes = slide.notes_slide.notes_text_frame.text
        except Exception:
            pass
        sections.append(
            f'<section class="slide" data-slide data-slide-id="slide-{slide_index:02d}">'
            + f'<div class="slide-stage">{"".join(elements)}</div>'
            + (f'<template class="speaker-notes">{html.escape(notes)}</template>' if notes else "")
            + "</section>"
        )
    css = """<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #101010; }
.deck { width: 1920px; margin: 0 auto; }
.slide { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
.slide-stage { position: relative; width: 1920px; height: 1080px; }
[data-pptx-element] { position: absolute; }
table[data-pptx-element] { border-collapse: collapse; }
table[data-pptx-element] td { border: 1px solid #CBD5E1; padding: 8px; }
</style>"""
    html_doc = f"<!doctype html><html><head><meta charset=\"utf-8\"><title>Editable PPTX import</title>{css}</head><body><main class=\"deck\">{''.join(sections)}</main></body></html>\n"
    (output_dir / "index.html").write_text(html_doc, encoding="utf-8")
    (output_dir / "import-report.json").write_text(json.dumps({"warnings": warnings, "slides": len(sections)}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output_dir / 'index.html'), "slides": len(sections), "warnings": len(warnings)}, indent=2))


if __name__ == "__main__":
    main()
