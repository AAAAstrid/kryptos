/** Character avatar rendering helpers */

function isImageUrl(url) {
  if (!url) return false;
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("/") ||
    url.startsWith("data:image/")
  );
}

function avatarFallback(name) {
  const ch = (name || "?").trim()[0] || "?";
  return ch.toUpperCase();
}

function avatarColor(id) {
  let hash = 0;
  const s = id || "default";
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  const hue = hash % 360;
  return `hsl(${hue}, 45%, 45%)`;
}

function renderAvatarHtml(charOrName, id, size = "md") {
  const name = typeof charOrName === "string" ? charOrName : charOrName?.name || "?";
  const charId = typeof charOrName === "string" ? id : charOrName?.id || id || name;
  const url = typeof charOrName === "string" ? "" : charOrName?.avatar_url || "";
  const cls = `avatar avatar-${size}`;

  if (url && isImageUrl(url)) {
    return `<span class="${cls}"><img src="${escapeAttr(url)}" alt="${escapeAttr(name)}" /></span>`;
  }
  if (url && !isImageUrl(url)) {
    return `<span class="${cls} avatar-emoji" title="${escapeAttr(name)}">${escapeHtml(url)}</span>`;
  }
  const letter = avatarFallback(name);
  const bg = avatarColor(charId);
  return `<span class="${cls} avatar-fallback" style="background:${bg}" title="${escapeAttr(name)}">${escapeHtml(letter)}</span>`;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

function renderAvatarButton(charOrName, id, size, charId) {
  const inner = renderAvatarHtml(charOrName, id, size);
  const cid = charId || (typeof charOrName === "object" ? charOrName?.id : id) || "";
  return `<button type="button" class="avatar-btn" data-char-id="${escapeAttr(cid)}" aria-label="查看角色">${inner}</button>`;
}
