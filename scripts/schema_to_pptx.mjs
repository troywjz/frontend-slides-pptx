#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';

const [schemaArg, outputArg] = process.argv.slice(2);
if (!schemaArg || !outputArg) {
  console.error('Usage: node scripts/schema_to_pptx.mjs <schema.json> <deck.pptx>');
  process.exit(1);
}

const schemaPath = path.resolve(schemaArg);
const outputPath = path.resolve(outputArg);
const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
const schemaDir = path.dirname(schemaPath);
const sourceDir = schema.sourceDir ? path.resolve(schema.sourceDir) : schemaDir;
const canvas = schema.canvas || { w: 1920, h: 1080 };
const sx = 13.333333 / Number(canvas.w || 1920);
const sy = 7.5 / Number(canvas.h || 1080);
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Frontend Slides PPTX';
pptx.company = 'Frontend Slides contributors';
pptx.subject = 'HTML to editable PowerPoint conversion';
pptx.title = schema.title || 'HTML to Editable PPTX';
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };

const shapeType = (name) => PptxGenJS.ShapeType?.[name] || name;
const hex = (value, fallback = 'FFFFFF') => {
  const text = String(value || fallback).replace('#', '').trim();
  return /^[0-9a-fA-F]{6}$/.test(text) ? text.toUpperCase() : fallback;
};
const pos = (element) => ({
  x: Number(element.x || 0) * sx,
  y: Number(element.y || 0) * sy,
  w: Number(element.w || 1) * sx,
  h: Number(element.h || 1) * sy,
});

function metadata(element) {
  const values = [`data-pptx-id:${element.id || ''}`];
  if (element.role) values.push(`data-pptx-role:${element.role}`);
  return values.join(';');
}

function setElementName(object, element) {
  const id = element.id;
  if (!id || !object) return;
  const altText = metadata(element);
  try { object.options.objectName = id; } catch { /* PptxGenJS stores object names in options. */ }
  try { object.options.altText = altText; } catch { /* Optional API surface. */ }
  try { object.name = id; } catch { /* PowerPoint object names are best-effort metadata. */ }
  try { object.altText = altText; } catch { /* Optional API surface. */ }
}

function addText(slide, element) {
  const p = pos(element);
  const lineSpacingPx = Number.parseFloat(element.lineHeight);
  const text = slide.addText(element.text || '', {
    ...p,
    margin: 0,
    fontFace: element.font || 'Aptos',
    // PowerPoint's text metrics run slightly taller than browser CSS pixels;
    // the small conversion factor keeps measured multi-line boxes from
    // overflowing while preserving the visual hierarchy.
    fontSize: Math.max(1, Number(element.fs || 16) * 0.72),
    color: hex(element.color, '111827'),
    bold: Boolean(element.bold),
    italic: Boolean(element.italic),
    align: element.align || 'left',
    valign: element.valign || 'top',
    fit: 'shrink',
    breakLine: false,
    ...(Number.isFinite(lineSpacingPx) ? { lineSpacing: lineSpacingPx * 0.75 } : {}),
    paraSpaceAfterPt: 0,
    objectName: element.id,
    altText: metadata(element),
  });
  setElementName(text, element);
}

function addRect(slide, element) {
  const p = pos(element);
  const kind = element.type === 'card' || Number(element.radius || 0) > 0 ? 'roundRect' : 'rect';
  const shape = slide.addShape(shapeType(kind), {
    ...p,
    rectRadius: Math.min(0.12, Number(element.radius || 0) * sx),
    fill: { color: hex(element.fill, 'FFFFFF'), transparency: element.fill ? 0 : 100 },
    line: { color: hex(element.line, 'FFFFFF'), width: Number(element.lineWidth || 0.5), transparency: element.line ? 0 : 100 },
    objectName: element.id,
    altText: metadata(element),
  });
  setElementName(shape, element);
}

function addLine(slide, element) {
  const p = pos(element);
  const line = slide.addShape(shapeType('line'), {
    ...p,
    line: { color: hex(element.color, '111827'), width: Math.max(0.4, Number(element.lineWidth || 1) * sx * 10) },
    objectName: element.id,
    altText: metadata(element),
  });
  setElementName(line, element);
}

function addTable(slide, element) {
  const cellOptions = {
    color: hex(element.color, '111827'),
    fontFace: element.font || 'Aptos',
    fontSize: Math.max(1, Number(element.fs || 14) * 0.72),
    margin: 0.06,
    valign: 'middle',
  };
  const rows = (element.rows || []).map((row) => row.map((cell) => ({
    text: typeof cell === 'string' ? cell : (cell.text || ''),
    options: { ...cellOptions, ...(typeof cell === 'string' ? {} : (cell.options || {})) },
  })));
  if (!rows.length) return;
  const table = slide.addTable(rows, {
    ...pos(element),
    border: { type: 'solid', color: hex(element.line, 'CBD5E1'), pt: 0.6 },
    objectName: element.id,
    altText: metadata(element),
  });
  setElementName(table, element);
}

function addImage(slide, element) {
  const options = {
    ...pos(element),
    sizingContain: false,
    objectName: element.id,
    altText: metadata(element),
  };
  if (element.svg) {
    const data = `data:image/svg+xml;base64,${Buffer.from(element.svg, 'utf8').toString('base64')}`;
    const image = slide.addImage({ data, ...options });
    setElementName(image, element);
    return;
  }
  if (!element.file) return;
  const candidates = [
    path.isAbsolute(element.file) ? element.file : path.resolve(schemaDir, element.file),
    path.isAbsolute(element.file) ? element.file : path.resolve(sourceDir, element.file),
  ];
  const filePath = candidates.find((candidate) => {
    try { return fsSync.existsSync(candidate); } catch { return false; }
  });
  if (!filePath) throw new Error(`Image asset not found for ${element.id || 'unnamed element'}: ${element.file}`);
  const image = slide.addImage({ path: filePath, ...options });
  setElementName(image, element);
}

for (const slideSpec of schema.slides || []) {
  const slide = pptx.addSlide();
  slide.background = { color: hex(slideSpec.background, 'FFFFFF') };
  for (const element of slideSpec.elements || []) {
    if (element.type === 'text') addText(slide, element);
    else if (element.type === 'rect' || element.type === 'card') addRect(slide, element);
    else if (element.type === 'line') addLine(slide, element);
    else if (element.type === 'table') addTable(slide, element);
    else if (element.type === 'image' || element.type === 'svg') addImage(slide, element);
  }
  if (slideSpec.notes) slide.addNotes(slideSpec.notes);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await pptx.writeFile({ fileName: outputPath, compression: true });
console.log(JSON.stringify({ output: outputPath, slides: schema.slides?.length || 0 }, null, 2));
