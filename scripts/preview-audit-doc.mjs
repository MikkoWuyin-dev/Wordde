// Offline markdown -> HTML renderer used to preview the audit documents in the
// app's preview pane (which only renders .html/.htm). No dependencies, no
// network. Handles the subset these docs use: headings, tables, fenced code,
// blockquotes, ordered/unordered lists, rules, and inline bold / italic /
// code / links.
//
// Usage:  node scripts/preview-audit-doc.mjs [src.md] [out.html]
// Defaults to the audit handoff document.
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = process.argv[2] || 'docs/Wordde_Audit_Handoff_2026-10-13.md';
const OUT = process.argv[3] || SRC.replace(/\.md$/, '.html');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(text) {
  let s = esc(text);
  // inline code first so its contents are not further transformed
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  return s;
}

const lines = readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n').split('\n');
const out = [];
let i = 0;
let inCode = false;

while (i < lines.length) {
  const line = lines[i];

  if (line.trimStart().startsWith('```')) {
    if (!inCode) {
      out.push('<pre><code>');
      inCode = true;
    } else {
      out.push('</code></pre>');
      inCode = false;
    }
    i++;
    continue;
  }
  if (inCode) {
    out.push(esc(line));
    i++;
    continue;
  }

  // Table: a header row immediately followed by a |---|---| separator.
  if (
    line.trim().startsWith('|') &&
    lines[i + 1] &&
    /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])
  ) {
    const cells = (r) =>
      r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const head = cells(line);
    i += 2;
    const body = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      body.push(cells(lines[i]));
      i++;
    }
    out.push('<table><thead><tr>');
    for (const h of head) out.push(`<th>${inline(h)}</th>`);
    out.push('</tr></thead><tbody>');
    for (const row of body) {
      out.push('<tr>');
      for (const c of row) out.push(`<td>${inline(c)}</td>`);
      out.push('</tr>');
    }
    out.push('</tbody></table>');
    continue;
  }

  const h = /^(#{1,6})\s+(.*)$/.exec(line);
  if (h) {
    out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    i++;
    continue;
  }

  if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
    out.push('<hr />');
    i++;
    continue;
  }

  if (/^>\s?/.test(line)) {
    const buf = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      buf.push(lines[i].replace(/^>\s?/, ''));
      i++;
    }
    out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
    continue;
  }

  if (/^\s*[-*]\s+/.test(line)) {
    const items = [];
    while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
      items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
      i++;
    }
    out.push('<ul>');
    for (const it of items) out.push(`<li>${inline(it)}</li>`);
    out.push('</ul>');
    continue;
  }

  if (/^\s*\d+\.\s+/.test(line)) {
    const items = [];
    while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
      items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
      i++;
    }
    out.push('<ol>');
    for (const it of items) out.push(`<li>${inline(it)}</li>`);
    out.push('</ol>');
    continue;
  }

  if (line.trim() === '') {
    i++;
    continue;
  }

  out.push(`<p>${inline(line)}</p>`);
  i++;
}

const titleMatch = /^#\s+(.*)$/m.exec(readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n'));
const docTitle = titleMatch ? titleMatch[1] : 'Wordde audit';

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(docTitle)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; background: #f7f7f8; color: #16181d;
         font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 980px; margin: 0 auto; padding: 40px 24px 96px; }
  h1 { font-size: 1.9em; line-height: 1.25; margin: 0 0 .6em; letter-spacing: -.01em; }
  h2 { font-size: 1.35em; margin: 2.2em 0 .5em; padding-bottom: .3em;
       border-bottom: 1px solid #e3e5ea; letter-spacing: -.005em; }
  h3 { font-size: 1.1em; margin: 1.8em 0 .4em; }
  p { margin: .7em 0; }
  a { color: #1f66d0; }
  code { background: #eceef2; border-radius: 4px; padding: .12em .38em;
         font: .88em/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  pre { background: #16181d; color: #e8eaee; border-radius: 8px; padding: 14px 16px;
        overflow-x: auto; font-size: 12.5px; line-height: 1.55; }
  pre code { background: none; color: inherit; padding: 0; font-size: inherit; }
  blockquote { margin: 1.1em 0; padding: .55em 1em; background: #fff6e0;
               border-left: 4px solid #e0a92b; border-radius: 0 6px 6px 0; }
  blockquote p { margin: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1.1em 0; font-size: .94em; }
  th, td { border: 1px solid #dfe2e8; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #eef0f4; font-weight: 600; }
  tbody tr:nth-child(even) { background: #fafbfc; }
  hr { border: 0; border-top: 1px solid #e3e5ea; margin: 2.4em 0; }
  ul, ol { padding-left: 1.5em; }
  li { margin: .3em 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d0f13; color: #e4e7ec; }
    h2, hr { border-color: #262a33; }
    code { background: #22262e; }
    th, td { border-color: #2a2f39; }
    th { background: #1b1f27; }
    tbody tr:nth-child(even) { background: #141821; }
    a { color: #6aa8ff; }
    blockquote { background: #241f10; }
  }
</style></head>
<body><main>
${out.join('\n')}
</main></body></html>
`;

writeFileSync(OUT, html, 'utf8');
console.log(`wrote ${OUT} (${html.length} bytes)`);
