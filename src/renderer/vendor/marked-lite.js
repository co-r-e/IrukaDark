(function () {
  if (typeof window === 'undefined') return;
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function parse(md) {
    md = String(md || '');
    // escape first for safety
    let out = escapeHtml(md);
    // code fences ```
    out = out.replace(/```([\s\S]*?)```/g, function (_, code) {
      return '<pre><code>' + code + '</code></pre>';
    });
    // inline code `code`
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    // bold **text** (italic disabled)
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Disable italic: strip single-asterisk emphasis to plain text
    out = out.replace(/\*([^*]+)\*/g, '$1');
    // links [text](url)
    out = out.replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1<\/a>'
    );
    // GFM tables
    out = (function toTables(text) {
      const lines = text.split(/\n/);
      const sepRe = /^\s*\|?\s*:?-{3,}\s*(\|\s*:?-{3,}\s*)+\|?\s*$/;
      const hasPipe = (s) => /\|/.test(s);
      const splitCells = (s) => {
        s = String(s || '');
        if (s.startsWith('|')) s = s.slice(1);
        if (s.endsWith('|')) s = s.slice(0, -1);
        return s.split('|').map((c) => c.trim());
      };
      let out = '';
      for (let i = 0; i < lines.length; i++) {
        const header = lines[i];
        const sep = i + 1 < lines.length ? lines[i + 1] : '';
        if (hasPipe(header) && sepRe.test(sep)) {
          const headers = splitCells(header);
          let j = i + 2;
          const rows = [];
          while (j < lines.length && hasPipe(lines[j]) && !/^\s*$/.test(lines[j])) {
            rows.push(splitCells(lines[j]));
            j++;
          }
          // build table
          out += '<table><thead><tr>';
          headers.forEach((h) => {
            out += '<th>' + h + '</th>';
          });
          out += '</tr></thead><tbody>';
          rows.forEach((r) => {
            out += '<tr>';
            for (let k = 0; k < headers.length; k++) {
              const v = typeof r[k] === 'undefined' ? '' : r[k];
              out += '<td>' + v + '</td>';
            }
            out += '</tr>';
          });
          out += '</tbody></table>';
          i = j - 1; // skip consumed lines
          continue;
        }
        out += header + '\n';
      }
      return out;
    })(out);
    // lists - item / * item
    out = out.replace(/^(?:[-*] )(.+)$/gm, '<li>$1</li>');
    out = out.replace(/(<li>[^<]+<\/li>\n?)+/g, function (m) {
      return '<ul>' + m.replace(/\n/g, '') + '</ul>';
    });
    // headings #, ##
    out = out
      .replace(/^###### (.+)$/gm, '<h6>$1</h6>')
      .replace(/^##### (.+)$/gm, '<h5>$1</h5>')
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // paragraphs (blank line breaks)
    out = out
      .split(/\n{2,}/)
      .map((p) =>
        /^\s*<h\d|^\s*<ul|^\s*<pre|^\s*<blockquote|^\s*<p|^\s*<table/.test(p)
          ? p
          : `<p>${p.replace(/\n/g, '<br>')}</p>`
      )
      .join('\n');
    return out;
  }
  window.marked = { parse, setOptions() {} };
})();
