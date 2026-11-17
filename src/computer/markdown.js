// A small Markdown renderer for previews in Finder: headings, paragraphs, lists,
// quotes, code, bold, italics and links. Everything is escaped first, so file contents
// can never inject HTML.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => ESC[c]);

const LINK = 'target="_blank" rel="noopener noreferrer"';

function inline(text) {
  const codes = [];
  let s = escapeHTML(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, `<a href="$2" ${LINK}>$1</a>`)
    .replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g, `$1<a href="$2" ${LINK}>$2</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*)_/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

export function renderMarkdown(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const flush = () => {
    flushPara();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      flush();
      const code = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      out.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)/);
    if (heading) {
      flush();
      const n = heading[1].length;
      out.push(`<h${n}>${inline(heading[2])}</h${n}>`);
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flush();
      out.push('<hr>');
      continue;
    }
    const quote = line.match(/^>\s?(.*)/);
    if (quote) {
      flush();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*+]\s+(.*)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((bullet || numbered)[1]);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}
