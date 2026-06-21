/** Paragraph breaks + quoted dialogue highlight (SillyTavern-style) */

const QUOTE_OPENERS = [
  { open: "「", close: "」" },
  { open: "『", close: "』" },
  { open: "\u201c", close: "\u201d" },
  { open: "\u2018", close: "\u2019" },
  { open: '"', close: '"' },
];

function escapeHtmlForMessage(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function highlightQuotedDialogue(escapedText) {
  let result = "";
  let i = 0;
  const text = escapedText;

  while (i < text.length) {
    let matched = false;
    for (const { open, close } of QUOTE_OPENERS) {
      if (!text.startsWith(open, i)) continue;
      const end = text.indexOf(close, i + open.length);
      if (end === -1) continue;
      const inner = text.slice(i + open.length, end);
      result +=
        open + `<span class="msg-dialogue">${inner}</span>` + close;
      i = end + close.length;
      matched = true;
      break;
    }
    if (!matched) {
      result += text[i];
      i += 1;
    }
  }
  return result;
}

function formatParagraphs(escapedText) {
  const blocks = escapedText.split(/\n{2,}/);
  const formatted = blocks.map((block) => {
    const withQuotes = highlightQuotedDialogue(block);
    const withBreaks = withQuotes.replace(/\n/g, "<br>");
    if (blocks.length === 1) return withBreaks;
    return block.trim() ? `<p class="msg-para">${withBreaks}</p>` : "";
  });
  return formatted.filter(Boolean).join("");
}

function formatMessageHtml(content) {
  if (!content) return "";
  return formatParagraphs(escapeHtmlForMessage(content));
}
