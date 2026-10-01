/**
 * HTML for pages the KaTeX WebView draws, entirely from local assets.
 *
 * Every screen that shows mathematics (lesson, exercise prompt, solution)
 * builds its body with these helpers and wraps it with pageHtml(), which
 * carries the stylesheet, the script tag and the height-reporting script.
 * Pure string functions, unit-tested without a WebView.
 */

import type { Rich } from '../lesson';
import { AUTO_RENDER_JS } from './autoRender';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function math(tex: string): string {
  return `<div class="math" data-tex="${escapeHtml(tex)}"></div>`;
}

export function rich(r: Rich, tag = 'p'): string {
  const text = r.text ? `<${tag}>${escapeHtml(r.text)}</${tag}>` : '';
  const tex = r.tex ? math(r.tex) : '';
  return text + tex;
}

export function pagesLabel(pages: number[]): string {
  const [a, b] = [pages[0], pages[pages.length - 1]];
  return a === b ? `p. ${a}` : `pp. ${a}–${b}`;
}

/** Ordered worked steps followed by the final line. */
export function stepsHtml(steps: Rich[], answerTex: string): string {
  return `<ol>${steps.map(s => `<li>${rich(s, 'div')}</li>`).join('')}</ol>${math(answerTex)}`;
}

export const PAGE_STYLE = `
  body { margin: 0; padding: 12px 14px 18px; font: 15px/1.5 -apple-system, Roboto, sans-serif; color: #16202B; background: #FFFFFF; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .src { font-size: 11px; color: #6B7A88; margin-bottom: 6px; }
  .obj { font-size: 13px; color: #3A4854; background: #F4F6F8; border-radius: 4px; padding: 6px 10px; margin-bottom: 10px; }
  p { margin: 0 0 10px; }
  .math { text-align: center; margin: 6px 0 12px; font-size: 18px; }
  .example, .exercise { border-left: 3px solid #14467E; border-radius: 4px; padding: 8px 12px; margin: 8px 0 12px; }
  .example { background: #EDF2F8; }
  .exercise { background: #FFF6E5; border-color: #8A5A00; }
  .q { font-weight: 600; margin-bottom: 4px; }
  .pg { font-weight: 400; color: #6B7A88; font-size: 12px; }
  ol { margin: 0 0 6px; padding-left: 20px; }
  li > div, li > p { margin: 0 0 4px; }
  details { margin: 4px 0; }
  summary { cursor: pointer; color: #14467E; font-weight: 600; font-size: 14px; }
  details.sol summary { color: #1D6B45; }
  .err { color: #8A2E2E; font-family: monospace; }
  .compact { padding-bottom: 4px; }
  .compact p:last-child, .compact .math:last-child { margin-bottom: 0; }
  #status { font-size: 11px; color: #6B7A88; margin-top: 10px; }
  #status.hidden { display: none; }
  .gen { white-space: pre-wrap; }
  .gen .katex-display { margin: 6px 0; }
`;

/**
 * Generated guidance as a page: the model's text, escaped, with the TeX it
 * writes between \( \), \[ \] or $ delimiters rendered by KaTeX's
 * auto-render extension. Everything else stays literal text.
 */
export function generatedHtml(text: string): string {
  // The model sometimes writes Markdown emphasis; the page is plain text, so
  // the markers would show as asterisks.
  const plain = text.replace(/\*\*/g, '');
  return pageHtml(`<div class="gen">${escapeHtml(plain)}</div>`, { compact: true, autoRender: true });
}

/**
 * Wrap a body in the full page. `statusNote` is appended to the render report
 * the page posts back; `showStatus` draws that report at the foot of the page.
 */
export function pageHtml(
  body: string,
  opts: { statusNote?: string; showStatus?: boolean; compact?: boolean; autoRender?: boolean } = {},
): string {
  const note = opts.statusNote ? `; ${opts.statusNote}` : '';
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="katex.min.css">
<script src="katex.min.js"></script>
${opts.autoRender ? `<script>${AUTO_RENDER_JS}</script>` : ''}
<style>${PAGE_STYLE}</style>
</head><body${opts.compact ? ' class="compact"' : ''}>
${body}
<div id="status"${opts.showStatus ? '' : ' class="hidden"'}></div>
<script>
  (function () {
    if (window.renderMathInElement) {
      renderMathInElement(document.body, {
        delimiters: [
          { left: '\\\\[', right: '\\\\]', display: true },
          { left: '\\\\(', right: '\\\\)', display: false },
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
      });
    }
    var nodes = document.querySelectorAll('.math');
    var ok = document.querySelectorAll('.gen .katex').length, bad = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      try {
        katex.render(n.getAttribute('data-tex'), n, { displayMode: true, throwOnError: true });
        ok++;
      } catch (e) {
        bad++;
        n.innerHTML = '<span class="err">' + String(e.message) + '</span>';
      }
    }
    var msg = 'KaTeX ' + (window.katex ? katex.version : 'missing') + ': rendered ' + ok + ' of ' + (ok + bad) +
      ' formulas offline${escapeHtml(note).replace(/'/g, "\\'")}';
    document.getElementById('status').textContent = msg;
    function post(payload) {
      if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); }
    }
    function reportHeight() {
      post({ type: 'height', height: document.documentElement.scrollHeight });
    }
    post({ type: 'status', message: msg });
    reportHeight();
    // Opening a hint or solution changes the height; fonts finishing loading can too.
    var details = document.querySelectorAll('details');
    for (var j = 0; j < details.length; j++) { details[j].addEventListener('toggle', reportHeight); }
    window.addEventListener('load', reportHeight);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(reportHeight); }
    setTimeout(reportHeight, 300);
  })();
</script>
</body></html>`;
}
