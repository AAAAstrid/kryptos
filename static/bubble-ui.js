/** Message bubble colors: per-character (extensions) + GM (localStorage) */

const GM_BUBBLE_KEY = "kryptos-gm-bubble";

const ROLE_BUBBLE_DEFAULTS = {
  "msg-gm": { hex: "#6c9eff", bgAlpha: 18, borderAlpha: 45 },
  "msg-referee": { hex: "#e8a54b", bgAlpha: 16, borderAlpha: 50 },
  "msg-player": { hex: "#4ade80", bgAlpha: 10, borderAlpha: 35 },
};

function parseRgbaColor(value, fallbackHex, fallbackAlpha) {
  if (!value) return { hex: fallbackHex, alpha: fallbackAlpha };
  if (value.startsWith("#")) {
    const hex = value.length >= 7 ? value.slice(0, 7) : fallbackHex;
    return { hex, alpha: fallbackAlpha };
  }
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return { hex: fallbackHex, alpha: fallbackAlpha };
  const hex =
    "#" +
    [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("");
  const alpha = m[4] ? Math.round(parseFloat(m[4]) * 100) : 100;
  return { hex, alpha };
}

function rgbaFromHex(hex, alphaPercent) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.max(0, Math.min(100, alphaPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function readBubblePickers(bgColorId, bgAlphaId, borderColorId, borderAlphaId) {
  return {
    bg: rgbaFromHex(document.getElementById(bgColorId).value, Number(document.getElementById(bgAlphaId).value)),
    border: rgbaFromHex(
      document.getElementById(borderColorId).value,
      Number(document.getElementById(borderAlphaId).value)
    ),
  };
}

function setBubblePickers(
  bgColorId,
  bgAlphaId,
  borderColorId,
  borderAlphaId,
  previewId,
  bgValue,
  borderValue,
  defaults
) {
  const bgParsed = parseRgbaColor(bgValue, defaults.hex, defaults.bgAlpha);
  const borderParsed = parseRgbaColor(borderValue, defaults.hex, defaults.borderAlpha);
  document.getElementById(bgColorId).value = bgParsed.hex;
  document.getElementById(bgAlphaId).value = String(bgParsed.alpha);
  document.getElementById(borderColorId).value = borderParsed.hex;
  document.getElementById(borderAlphaId).value = String(borderParsed.alpha);
  updateBubblePreview(previewId, bgColorId, bgAlphaId, borderColorId, borderAlphaId);
}

function updateBubblePreview(previewId, bgColorId, bgAlphaId, borderColorId, borderAlphaId) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  const { bg, border } = readBubblePickers(bgColorId, bgAlphaId, borderColorId, borderAlphaId);
  preview.style.background = bg;
  preview.style.borderColor = border;
}

function loadGmBubble() {
  try {
    const raw = localStorage.getItem(GM_BUBBLE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.bg || data?.border) return data;
  } catch {
    /* ignore */
  }
  return null;
}

function saveGmBubble(bg, border) {
  localStorage.setItem(GM_BUBBLE_KEY, JSON.stringify({ bg, border }));
}

function getMessageBubbleStyle(senderId, char) {
  if (senderId === "gm") {
    const gm = loadGmBubble();
    if (gm?.bg || gm?.border) return gm;
    return null;
  }
  const rosterChar =
    typeof getRosterChar === "function" ? getRosterChar(char?.id || senderId) : null;
  const ext = rosterChar?.extensions || char?.extensions;
  if (ext?.bubble_bg || ext?.bubble_border) {
    return { bg: ext.bubble_bg, border: ext.bubble_border };
  }
  return null;
}

function applyBubbleStyleToElement(node, style) {
  if (!style?.bg && !style?.border) return;
  node.classList.add("msg-custom");
  if (style.bg) {
    node.style.setProperty("--msg-custom-bg", style.bg);
    node.style.background = style.bg;
  }
  if (style.border) {
    node.style.setProperty("--msg-custom-border", style.border);
    node.style.borderColor = style.border;
  }
}
