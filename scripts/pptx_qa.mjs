#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const [command, inputArg] = process.argv.slice(2);
const usage = 'Usage: node scripts/pptx_qa.mjs <inspect|qa> <deck.pptx>';
if (!command || !inputArg || !['inspect', 'qa'].includes(command)) {
  console.error(usage);
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const decodeXml = (value) => String(value)
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const slideNumber = (name) => Number(name.match(/slide(\d+)\.xml$/)?.[1] || 0);

const zip = await JSZip.loadAsync(await fs.readFile(inputPath));
const names = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
names.sort((a, b) => slideNumber(a) - slideNumber(b));
const warnings = [];
const issues = [];
const ids = new Map();
let slideWidth = 0;
let slideHeight = 0;

const presentation = zip.file('ppt/presentation.xml');
if (presentation) {
  const xml = await presentation.async('string');
  const size = xml.match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"[^>]*\/?>(?:<\/p:sldSz>)?/);
  if (size) { slideWidth = Number(size[1]); slideHeight = Number(size[2]); }
}
if (!slideWidth || !slideHeight) warnings.push('Slide size could not be parsed; bounds checks were skipped.');

const slides = [];
for (const name of names) {
  const xml = await zip.file(name).async('string');
  const slideObjectNames = new Map();
  let unparsedGeometryCount = 0;
  const text = [...xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)]
    .map((match) => decodeXml(match[1]).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const objects = [...xml.matchAll(/<(p:sp|p:pic|p:graphicFrame|p:cxnSp)\b[\s\S]*?<\/\1>/g)].map((match) => match[0]);
  for (const object of objects) {
    const cNvPr = object.match(/<p:cNvPr\b[^>]*>/)?.[0];
    const objectName = cNvPr ? decodeXml(attr(cNvPr, 'name') || '') : '';
    const description = cNvPr ? decodeXml(attr(cNvPr, 'descr') || '') : '';
    const id = description.match(/(?:^|;)data-pptx-id:([^;]+)/)?.[1] || '';
    if (id) ids.set(id, [...(ids.get(id) || []), name]);
    if (objectName) slideObjectNames.set(objectName, (slideObjectNames.get(objectName) || 0) + 1);
    const xfrm = object.match(/<a:xfrm\b[\s\S]*?<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"[^>]*\/>[\s\S]*?<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"[^>]*\/>/);
    if (slideWidth && slideHeight && xfrm) {
      const [, x, y, w, h] = xfrm.slice(1).map(Number);
      if (x < 0 || y < 0 || x + w > slideWidth || y + h > slideHeight) {
        issues.push(`${name}: object "${objectName || id || 'unnamed'}" exceeds slide bounds.`);
      }
    } else if (slideWidth && slideHeight && !xfrm) {
      unparsedGeometryCount += 1;
    }
  }
  for (const [objectName, count] of slideObjectNames) {
    if (count > 1) issues.push(`${name}: duplicate objectName "${objectName}" on the same slide (${count} objects).`);
  }
  if (unparsedGeometryCount) {
    warnings.push(`${name}: ${unparsedGeometryCount} object(s) had no reliably parseable geometry; bounds checks skipped for them.`);
  }
  const emptyPlaceholders = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)]
    .filter((match) => /<p:ph\b/.test(match[0]) && !/<a:t\b[^>]*>\s*[^<\s]/.test(match[0]));
  for (const placeholder of emptyPlaceholders) issues.push(`${name}: empty placeholder.`);
  slides.push({ slide: slides.length + 1, file: name, text: text.join(' | '), textSummary: text.slice(0, 3) });
}

if (!slides.length) issues.push('No slides found.');
for (const [id, locations] of ids) if (locations.length > 1) issues.push(`Duplicate data-pptx-id "${id}" on ${locations.join(', ')}.`);

const report = { inputPath, slideCount: slides.length, slides };
if (command === 'inspect') {
  console.log(JSON.stringify({ ...report, warnings }, null, 2));
} else {
  const result = { inputPath, passed: issues.length === 0, slideCount: slides.length, issues, warnings };
  console.log(JSON.stringify(result, null, 2));
  if (issues.length) process.exitCode = 1;
}
