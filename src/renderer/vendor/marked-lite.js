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
        /^\s*<h\d|^\s*<ul|^\s*<pre|^\s*<blockquote|^\s*<p/.test(p)
          ? p
          : `<p>${p.replace(/\n/g, '<br>')}</p>`
      )
      .join('\n');
    return out;
  }
  window.marked = { parse, setOptions() {} };
})();
