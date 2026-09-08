#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [htmlPath, workDirArg] = process.argv.slice(2);
if (!htmlPath || !workDirArg) {
  console.error('Usage: node scripts/roundtrip_check.mjs <deck.html> <work-dir>');
  process.exit(1);
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workDir = path.resolve(workDirArg);
await fs.mkdir(workDir, { recursive: true });
const schema = path.join(workDir, 'deck-schema.json');
const pptx = path.join(workDir, 'deck.pptx');
const imported = path.join(workDir, 'imported-html');
execFileSync(process.execPath, [path.join(repo, 'scripts/dom_to_schema.mjs'), htmlPath, schema], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(repo, 'scripts/schema_to_pptx.mjs'), schema, pptx], { stdio: 'inherit' });
execFileSync(process.env.PYTHON || 'python', [path.join(repo, 'scripts/pptx_to_html.py'), pptx, imported], { stdio: 'inherit' });
const parsed = JSON.parse(await fs.readFile(schema, 'utf8'));
const report = JSON.parse(await fs.readFile(path.join(imported, 'import-report.json'), 'utf8'));
const importedHtml = await fs.readFile(path.join(imported, 'index.html'), 'utf8');
const sourceIds = parsed.slides.flatMap((slide) => slide.elements.map((element) => element.id));
const missingIds = sourceIds.filter((id) => !importedHtml.includes(`data-pptx-id="${id}"`));
if (missingIds.length) {
  throw new Error(`Round-trip lost element IDs: ${missingIds.join(', ')}`);
}
console.log(JSON.stringify({
  slides: parsed.slides.length,
  sourceElements: sourceIds.length,
  importedSlides: report.slides,
  importedElementIds: sourceIds.length - missingIds.length,
  importWarnings: report.warnings,
}, null, 2));
