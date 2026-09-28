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
const recoveredSchema = path.join(workDir, 'recovered-schema.json');
execFileSync(process.execPath, [path.join(repo, 'scripts/dom_to_schema.mjs'), htmlPath, schema], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(repo, 'scripts/schema_to_pptx.mjs'), schema, pptx], { stdio: 'inherit' });
execFileSync(process.env.PYTHON || 'python', [path.join(repo, 'scripts/pptx_to_html.py'), pptx, imported], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(repo, 'scripts/dom_to_schema.mjs'), path.join(imported, 'index.html'), recoveredSchema], { stdio: 'inherit' });
const parsed = JSON.parse(await fs.readFile(schema, 'utf8'));
const report = JSON.parse(await fs.readFile(path.join(imported, 'import-report.json'), 'utf8'));
const importedHtml = await fs.readFile(path.join(imported, 'index.html'), 'utf8');
const recovered = JSON.parse(await fs.readFile(recoveredSchema, 'utf8'));
const sourceIds = parsed.slides.flatMap((slide) => slide.elements.map((element) => element.id));
const missingIds = sourceIds.filter((id) => !importedHtml.includes(`data-pptx-id="${id}"`));
if (missingIds.length) {
  throw new Error(`Round-trip lost element IDs: ${missingIds.join(', ')}`);
}
const recoveredById = new Map(recovered.slides.flatMap((slide) => slide.elements.map((element) => [element.id, element])));
const explicitBreaks = parsed.slides.flatMap((slide) => slide.elements)
  .filter((element) => element.type === 'text' && String(element.text || '').includes('\n'));
const lostBreaks = explicitBreaks.filter((element) => {
  const expectedBreaks = (String(element.text).match(/\n/g) || []).length;
  const actualBreaks = (String(recoveredById.get(element.id)?.text || '').match(/\n/g) || []).length;
  return actualBreaks < expectedBreaks;
});
if (lostBreaks.length) {
  throw new Error(`Round-trip lost explicit line breaks: ${lostBreaks.map((element) => element.id).join(', ')}`);
}
console.log(JSON.stringify({
  slides: parsed.slides.length,
  sourceElements: sourceIds.length,
  importedSlides: report.slides,
  importedElementIds: sourceIds.length - missingIds.length,
  explicitBreakElements: explicitBreaks.length,
  preservedBreakElements: explicitBreaks.length - lostBreaks.length,
  importWarnings: report.warnings,
}, null, 2));
