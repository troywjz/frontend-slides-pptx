#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const inputArg = args.find((arg) => !arg.startsWith('--'));
const strict = args.includes('--strict');
const json = args.includes('--json');
if (!inputArg) {
  console.error('Usage: node scripts/html_content_qa.mjs <deck.html> [--strict] [--json]');
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
await fs.access(inputPath);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(inputPath).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts?.ready);

const report = await page.evaluate(() => {
  const closingPunctuation = /^[。；，、：！？,.!?;:）】》〕〉」』’”]/;
  const cjkFragment = /^[\u3400-\u9fff]{1,2}[。！？.!?]?$/;
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const renderedLines = (element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const chars = [];
    let node;
    while ((node = walker.nextNode())) {
      for (let index = 0; index < node.textContent.length; index += 1) {
        const character = node.textContent[index];
        if (/\s/.test(character) && character !== '\n') continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = [...range.getClientRects()][0];
        if (!rect || rect.width === 0 || rect.height === 0) continue;
        chars.push({ character, top: Math.round(rect.top / 2) * 2 });
      }
    }
    const grouped = new Map();
    for (const item of chars) grouped.set(item.top, `${grouped.get(item.top) || ''}${item.character}`);
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text.trim()).filter(Boolean);
  };

  const textElements = [...document.querySelectorAll('[data-pptx-type="text"]')].filter(isVisible);
  const wrapIssues = [];
  for (const element of textElements) {
    const lines = renderedLines(element);
    if (lines.length < 2) continue;
    const id = element.getAttribute('data-pptx-id') || element.className || element.tagName;
    const slide = element.closest('[data-slide-id]')?.getAttribute('data-slide-id') || 'unknown-slide';
    for (const line of lines.slice(1)) {
      if (closingPunctuation.test(line)) {
        wrapIssues.push({ type: 'line-start-punctuation', slide, id, lines, message: `Wrapped line starts with closing punctuation: ${line}` });
      }
    }
    const lastLine = lines.at(-1);
    if (cjkFragment.test(lastLine)) {
      const bodyLength = [...lastLine.replace(/[。！？.!?]$/, '')].length;
      const severity = /[。！？.!?]$/.test(lastLine) || bodyLength === 1 ? 'error' : 'warning';
      wrapIssues.push({ type: 'terminal-fragment', severity, slide, id, lines, message: `Suspicious final fragment: ${lastLine}` });
    }
  }

  const groups = new Map();
  for (const element of textElements) {
    const group = element.getAttribute('data-content-qa-group');
    const role = element.getAttribute('data-content-role');
    if (!group || !role) continue;
    const slide = element.closest('[data-slide-id]')?.getAttribute('data-slide-id') || 'unknown-slide';
    const entry = groups.get(group) || { group, slide, roles: {} };
    entry.roles[role] = [...(entry.roles[role] || []), element.innerText.trim()];
    groups.set(group, entry);
  }
  const chainIssues = [];
  for (const entry of groups.values()) {
    for (const role of ['result', 'formula']) {
      if (!entry.roles[role]?.length) chainIssues.push({ type: 'missing-chain-role', slide: entry.slide, group: entry.group, message: `Missing ${role} role` });
    }
    if (!entry.roles.basis?.length && !entry.roles.boundary?.length) chainIssues.push({ type: 'missing-chain-role', slide: entry.slide, group: entry.group, message: 'Missing basis or boundary role' });
    const formulas = entry.roles.formula || [];
    if (formulas.length && !formulas.some((value) => /[×*=]/.test(value))) chainIssues.push({ type: 'formula-without-operator', slide: entry.slide, group: entry.group, message: 'Formula must visibly contain multiplication or equality operators' });
  }
  return { wrapIssues, chainIssues, groups: [...groups.values()], textElementCount: textElements.length };
});

await browser.close();
const errors = [...report.wrapIssues, ...report.chainIssues].filter((issue) => issue.severity !== 'warning');
const result = { inputPath, passed: errors.length === 0, strict, ...report, errorCount: errors.length };
if (json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`HTML content QA: ${result.passed ? 'passed' : 'failed'} (${report.textElementCount} text elements, ${report.groups.length} quantitative groups)`);
  for (const issue of [...report.wrapIssues, ...report.chainIssues]) console.log(`[${issue.severity || 'error'}] ${issue.slide || ''} ${issue.id || issue.group || ''}: ${issue.message}`);
}
if (strict && errors.length) process.exitCode = 1;
