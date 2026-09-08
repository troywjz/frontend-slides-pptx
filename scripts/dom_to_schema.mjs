#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [htmlArg, outputArg] = process.argv.slice(2);
if (!htmlArg || !outputArg) {
  console.error('Usage: node scripts/dom_to_schema.mjs <deck.html> <schema.json>');
  process.exit(1);
}

const htmlPath = path.resolve(htmlArg);
const outputPath = path.resolve(outputArg);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });

const measured = await page.evaluate(() => {
  const slideNodes = [...document.querySelectorAll('[data-slide], .slide')];
  const slides = slideNodes.length ? slideNodes : [document.body];
  const warnings = [];
  const color = (value) => {
    if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return undefined;
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return value.startsWith('#') ? value : undefined;
    const hex = [match[1], match[2], match[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    return `#${hex}`;
  };
  const number = (value, fallback = 0) => Number.parseFloat(value) || fallback;
  const textContent = (node) => (node.textContent || '').replace(/\s+/g, ' ').trim();
  const toElement = (node, stage, slideIndex, elementIndex) => {
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const style = getComputedStyle(node);
    const className = typeof node.className === 'string' ? node.className : (node.getAttribute('class') || '');
    const idBase = node.dataset.pptxId || node.id || node.dataset.pptxRole || className.split(/\s+/).filter(Boolean)[0] || node.tagName.toLowerCase();
    const id = idBase;
    const common = {
      id,
      x: rect.left - stage.left,
      y: rect.top - stage.top,
      w: rect.width,
      h: rect.height,
      role: node.dataset.pptxRole || undefined,
    };
    const explicitType = node.dataset.pptxType;
    const hasElementChildren = node.children.length > 0;
    const hasPaint = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent'
      || Number.parseFloat(style.borderTopWidth) > 0 || Number.parseFloat(style.borderRightWidth) > 0
      || Number.parseFloat(style.borderBottomWidth) > 0 || Number.parseFloat(style.borderLeftWidth) > 0;
    if (node instanceof HTMLImageElement || explicitType === 'image') {
      return { ...common, type: 'image', file: node.getAttribute('src') || '', alt: node.getAttribute('alt') || '' };
    }
    if (node instanceof SVGElement || explicitType === 'svg') {
      return { ...common, type: 'svg', svg: node.outerHTML };
    }
    if (node instanceof HTMLTableElement || explicitType === 'table') {
      const rows = [...node.rows].map((row) => [...row.cells].map((cell) => ({
        text: (cell.textContent || '').replace(/\s+/g, ' ').trim(),
      })));
      return {
        ...common,
        type: 'table',
        rows,
        font: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        fs: number(style.fontSize, 14),
        color: color(style.color) || '#111827',
        line: color(style.borderColor),
      };
    }
    if (explicitType === 'line') {
      return { ...common, type: 'line', color: color(style.backgroundColor) || color(style.borderTopColor) || '#111827', lineWidth: number(style.borderTopWidth, 1) };
    }
    if (explicitType === 'rect' || explicitType === 'card' || node.dataset.pptxShape === 'rect' || (hasPaint && hasElementChildren)) {
      return { ...common, type: explicitType === 'card' ? 'card' : 'rect', fill: color(style.backgroundColor), line: color(style.borderColor), lineWidth: number(style.borderWidth), radius: number(style.borderRadius) };
    }
    const text = textContent(node);
    if (text) {
      return {
        ...common,
        type: 'text',
        text,
        font: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        fs: number(style.fontSize, 16),
        color: color(style.color) || '#111827',
        bold: Number.parseInt(style.fontWeight, 10) >= 600 || style.fontWeight === 'bold',
        italic: style.fontStyle === 'italic',
        align: style.textAlign,
        lineHeight: style.lineHeight,
      };
    }
    warnings.push(`${id}: unsupported or empty element ${node.tagName.toLowerCase()}`);
    return null;
  };

  const outputSlides = slides.map((slide, slideIndex) => {
    const stage = slide.querySelector('[data-stage]') || slide;
    const stageRect = stage.getBoundingClientRect();
    const explicitElements = [...slide.querySelectorAll('[data-pptx-element], [data-pptx-type], [data-pptx-shape]')];
    const autoElements = [...slide.querySelectorAll('*')].filter((node) => {
      if (explicitElements.includes(node) || node === slide || node === stage) return false;
      if (node instanceof SVGElement && node.parentElement instanceof SVGElement) return false;
      if (node.closest('table[data-pptx-element], [data-pptx-type="table"]')) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(node);
      const hasText = Boolean((node.textContent || '').trim());
      const isMedia = node instanceof HTMLImageElement || node instanceof SVGElement;
      const hasChildren = node.children.length > 0;
      const hasPaint = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent'
        || Number.parseFloat(style.borderTopWidth) > 0 || Number.parseFloat(style.borderRightWidth) > 0
        || Number.parseFloat(style.borderBottomWidth) > 0 || Number.parseFloat(style.borderLeftWidth) > 0;
      return isMedia || (hasText && !hasChildren) || (hasPaint && hasChildren);
    });
    const slideElements = [...new Set([...explicitElements, ...autoElements])];
    const usedIds = new Map();
    const elements = slideElements.map((node, elementIndex) => {
      const base = node.dataset.pptxId || node.id || node.dataset.pptxRole || (typeof node.className === 'string' ? node.className : (node.getAttribute('class') || '')).split(/\s+/).filter(Boolean)[0] || node.tagName.toLowerCase();
      const count = usedIds.get(base) || 0;
      usedIds.set(base, count + 1);
      if (!node.dataset.pptxId && !node.id) node.dataset.pptxId = count ? `${base}-${count + 1}` : base;
      return toElement(node, stageRect, slideIndex, elementIndex);
    }).filter(Boolean);
    return {
      id: slide.dataset.slideId || `slide-${String(slideIndex + 1).padStart(2, '0')}`,
      background: color(getComputedStyle(slide).backgroundColor),
      notes: slide.querySelector('template.speaker-notes')?.content.textContent?.trim() || '',
      elements,
    };
  });
  return { schemaVersion: '0.1', canvas: { w: 1920, h: 1080 }, source: location.href, slides: outputSlides, warnings };
});

await browser.close();
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(
  outputPath,
  `${JSON.stringify({ ...measured, source: htmlPath, sourceDir: path.dirname(htmlPath) }, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify({ output: outputPath, slides: measured.slides.length, warnings: measured.warnings.length }, null, 2));
