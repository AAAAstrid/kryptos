const state = {
  sessions: [],
  currentSessionId: null,
  session: null,
  roster: [],
  currentView: "public",
  selectedCharId: null,
  pollTimer: null,
  sending: false,
  charFormDirty: false,
  lastRenderedCharId: null,
  autoDialogueTimer: null,
  autoDialogueLoop: false,
  autoDialogueBurst: false,
  autoDialogueLastSpeakerId: null,
  expandedReasoningIds: new Set(),
  expandedWorldBookIds: new Set(),
  lastMessagesFingerprint: null,
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json();
}

function el(id) {
  return document.getElementById(id);
}

function isCharInCurrentSession(charId) {
  return !!state.session?.characters?.[charId];
}

function getMutedCharIds() {
  const raw = state.session?.game_state?.muted_characters;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter(Boolean));
}

function isCharMuted(charId) {
  return charId && getMutedCharIds().has(charId);
}

function getRosterChar(charId) {
  return state.roster.find((c) => c.id === charId);
}

function getChar(senderId) {
  return state.session?.characters?.[senderId] || getRosterChar(senderId);
}

function safeAvatarHtml(charOrName, id, size) {
  try {
    return renderAvatarHtml(charOrName, id, size);
  } catch (e) {
    console.error("avatar render failed", e);
    return `<span class="avatar avatar-${size} avatar-fallback">?</span>`;
  }
}

function safeAvatarButton(charOrName, id, size, charId) {
  try {
    return renderAvatarButton(charOrName, id, size, charId);
  } catch (e) {
    console.error("avatar button render failed", e);
    const cid = charId || "";
    return `<button type="button" class="avatar-btn" data-char-id="${escapeAttr(cid)}" aria-label="查看角色"><span class="avatar avatar-${size} avatar-fallback">?</span></button>`;
  }
}

function markCharFormDirty() {
  state.charFormDirty = true;
  updateCharSaveReminder();
}

function updateCharSaveReminder() {
  const reminder = el("char-save-reminder");
  if (!reminder) return;
  reminder.classList.toggle("save-reminder--dirty", state.charFormDirty);
  reminder.textContent = state.charFormDirty
    ? "有未保存的修改，请点击下方「保存」。"
    : "修改后请点击下方「保存」，否则切换角色或刷新页面会丢失。";
}

function shouldSkipCharFormReset() {
  const form = el("char-form");
  if (!form || form.classList.contains("hidden")) return false;
  if (state.charFormDirty) return true;
  const active = document.activeElement;
  return active && form.contains(active) && active.matches("input, textarea, select");
}

function setCharFieldEnabled(id, enabled) {
  const field = el(id);
  if (field) field.disabled = !enabled;
}

function updateCharFormChrome(global, inSession) {
  const badge = el("char-session-badge");
  const joinBtn = el("btn-join-char");
  const info = el("char-config");

  if (info && global) info.textContent = `编辑: ${global.name}`;

  if (badge) {
    const muted = inSession && isCharMuted(state.selectedCharId);
    badge.textContent = inSession
      ? muted
        ? "已加入本群 · 当前已禁言（左侧可解禁）"
        : "已加入本群 · 本局私密/目标仅对本群生效（左侧可移出本群）"
      : "未加入本群 · 可编辑全局人设，加入后可设本局秘密";
  }

  joinBtn?.classList.toggle("hidden", inSession || !state.currentSessionId);
  el("btn-delete-char")?.classList.remove("hidden");

  setCharFieldEnabled("cfg-hidden", inSession);
  setCharFieldEnabled("cfg-goals", inSession);
  const speakBtn = el("btn-speak-char");
  if (speakBtn) {
    const muted = inSession && isCharMuted(state.selectedCharId);
    speakBtn.disabled = !inSession || muted;
    speakBtn.title = muted ? "该角色在本群已被禁言" : "";
  }
}

function parseError(e) {
  try {
    const j = JSON.parse(e.message);
    return j.detail || e.message;
  } catch {
    return e.message;
  }
}

async function loadRoster() {
  state.roster = await api("/api/characters");
}

async function loadSessions() {
  state.sessions = await api("/api/sessions");
  const list = el("session-list");
  list.innerHTML = "";
  state.sessions.forEach((s) => {
    const li = document.createElement("li");
    li.className = s.id === state.currentSessionId ? "active" : "";
    li.innerHTML = `<strong>${escapeHtml(s.title)}</strong><div class="meta">${s.status} · ${s.character_count} 角色</div>`;
    li.onclick = () => selectSession(s.id);
    list.appendChild(li);
  });
  const delBtn = el("btn-delete-session");
  if (delBtn) delBtn.disabled = !state.currentSessionId;
}

async function selectSession(id) {
  stopAutoDialogue();
  state.currentSessionId = id;
  state.session = await api(`/api/sessions/${id}`);
  await loadWorldBookIntoSession();
  state.currentView = "public";
  state.autoDialogueLastSpeakerId = null;
  state.lastMessagesFingerprint = null;
  state.expandedReasoningIds.clear();
  if (state.selectedCharId && !getRosterChar(state.selectedCharId)) {
    state.selectedCharId = null;
  }
  if (!state.selectedCharId) {
    const inSession = Object.values(state.session.characters);
    state.selectedCharId =
      inSession.find((c) => !c.is_referee)?.id || inSession[0]?.id || state.roster[0]?.id || null;
  }
  renderAll();
  startPolling();
  maybeStartContinuousOnLoad();
}

function getCheckedViewerIds() {
  const ids = [];
  document.querySelectorAll(".viewer-cb:checked").forEach((cb) => ids.push(cb.value));
  return ids;
}

const PRIVATE_REPLY_INSTRUCTION =
  "上一条是 GM 私下对你说的话，仅你可见。请同样以私密方式回应 GM，不要发到场上公开对话。不要输出方括号标记，不要提及私密等元信息。篇幅1～2句，不要复述设定。";

function getCharDisplayName(charId) {
  const c = state.session?.characters?.[charId] || getRosterChar(charId);
  return c?.name || charId || "未知角色";
}

function getPrivateReplyTargetCharId() {
  syncRestrictedViewersToSelectedChar();
  const checked = getCheckedViewerIds();
  if (checked.length) return checked[0];
  const target = getPrivateTargetSessionChar();
  return target?.id || null;
}

function privateReplyOptionsFor(charId) {
  const name = getCharDisplayName(charId);
  return {
    visibility: "restricted",
    viewers: ["gm"],
    instruction:
      `【身份】你是「${name}」，本条回复只能以该角色身份书写，禁止扮演或模仿其他角色。` +
      PRIVATE_REPLY_INSTRUCTION,
  };
}

function sameCharId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function getPrivateTargetSessionChar() {
  const charId = state.selectedCharId;
  if (!charId || !isCharInCurrentSession(charId)) return null;
  return state.session.characters[charId];
}

function syncRestrictedViewersToSelectedChar() {
  if (el("msg-visibility").value !== "restricted") return;
  const target = getPrivateTargetSessionChar();
  document.querySelectorAll(".viewer-cb").forEach((cb) => {
    cb.checked = Boolean(target && sameCharId(cb.value, target.id));
  });
}

function updateCharListActiveState() {
  const list = el("char-list");
  if (!list) return;
  list.querySelectorAll("li").forEach((item) => {
    const idx = Number(item.dataset.rosterIndex);
    const c = state.roster[idx];
    item.classList.toggle("active", c && sameCharId(c.id, state.selectedCharId));
  });
}

function updateComposerPrivateMode() {
  const vis = el("msg-visibility")?.value || "public";
  const isRestricted = vis === "restricted";
  el("viewers-box")?.classList.toggle("hidden", !isRestricted);
  const hint = el("composer-private-hint");
  if (hint) hint.classList.toggle("hidden", !isRestricted);
  if (!isRestricted) return;

  const nameEl = el("private-target-name");
  const target = getPrivateTargetSessionChar();
  if (target) {
    if (nameEl) nameEl.textContent = target.name;
    syncRestrictedViewersToSelectedChar();
  } else if (nameEl) {
    nameEl.textContent = "请先在右侧选择本群角色";
    syncRestrictedViewersToSelectedChar();
  }
}

async function replyAfterRestrictedMessage(viewerIds) {
  for (const charId of viewerIds) {
    if (!isCharInCurrentSession(charId)) continue;
    await speakCharacter(charId, privateReplyOptionsFor(charId));
  }
}

function setupComposerInteractions() {
  const box = el("viewers-checkboxes");
  if (box && !box.dataset.bound) {
    box.dataset.bound = "1";
    box.addEventListener("change", (e) => {
      if (el("msg-visibility").value !== "restricted") return;
      const cb = e.target.closest(".viewer-cb");
      if (!cb) return;
      document.querySelectorAll(".viewer-cb").forEach((other) => {
        if (other !== cb) other.checked = false;
      });
      if (!cb.checked || !cb.value) return;
      const charId = cb.value;
      if (!sameCharId(state.selectedCharId, charId)) {
        state.selectedCharId = charId;
        state.charFormDirty = false;
        updateCharListActiveState();
        renderCharForm(true);
      }
      const nameEl = el("private-target-name");
      const sc = state.session?.characters?.[charId];
      if (nameEl && sc) nameEl.textContent = sc.name;
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAutoDialogueSettings() {
  const raw = state.session?.game_state?.auto_dialogue || {};
  return {
    enabled: Boolean(raw.enabled),
    interval_sec: Math.min(120, Math.max(2, Number(raw.interval_sec ?? 8))),
    max_turns: Math.min(30, Math.max(1, Number(raw.max_turns ?? 6))),
    continuous: Boolean(raw.continuous),
    include_referee: Boolean(raw.include_referee),
    speaker_mode: raw.speaker_mode === "random" ? "random" : "rotate",
  };
}

function getAutoSpeakers() {
  if (!state.session) return [];
  const settings = getAutoDialogueSettings();
  return Object.values(state.session.characters).filter((c) => {
    if (isCharMuted(c.id)) return false;
    if (!settings.include_referee && c.is_referee) return false;
    return true;
  });
}

function pickNextAutoSpeaker() {
  const speakers = getAutoSpeakers();
  if (!speakers.length) return null;
  const settings = getAutoDialogueSettings();
  if (settings.speaker_mode === "random") {
    const pool = speakers.filter((c) => c.id !== state.autoDialogueLastSpeakerId);
    const list = pool.length ? pool : speakers;
    return list[Math.floor(Math.random() * list.length)];
  }
  const lastIdx = speakers.findIndex((c) => c.id === state.autoDialogueLastSpeakerId);
  const nextIdx = lastIdx >= 0 ? (lastIdx + 1) % speakers.length : 0;
  return speakers[nextIdx];
}

function updateAutoDialogueStatus(text) {
  const box = el("auto-dialogue-status");
  if (!box) return;
  if (!text) {
    box.classList.add("hidden");
    box.textContent = "";
    return;
  }
  box.classList.remove("hidden");
  box.textContent = text;
}

function setAutoDialogueControlsDisabled(disabled) {
  renderAutoDialogueForm();
}

function renderAutoDialogueForm() {
  const section = el("section-auto-dialogue");
  if (!section) return;

  const hasSession = !!state.session;
  const running = state.autoDialogueLoop || state.autoDialogueBurst;
  section.classList.toggle("auto-dialogue-running", running);

  section.querySelectorAll("input, select").forEach((node) => {
    node.disabled = !hasSession || running;
  });

  const startBtn = el("btn-start-auto-dialogue");
  const saveBtn = el("btn-save-auto-dialogue");
  const stopBtn = el("btn-stop-auto-dialogue");
  if (startBtn) startBtn.disabled = !hasSession || running;
  if (saveBtn) saveBtn.disabled = !hasSession || running;
  if (stopBtn) stopBtn.disabled = !hasSession;

  if (!hasSession) {
    updateAutoDialogueStatus("");
    return;
  }

  const s = getAutoDialogueSettings();
  el("auto-dialogue-enabled").checked = s.enabled;
  el("auto-dialogue-continuous").checked = s.continuous;
  el("auto-dialogue-interval").value = String(s.interval_sec);
  el("auto-dialogue-max-turns").value = String(s.max_turns);
  el("auto-dialogue-referee").checked = s.include_referee;
  el("auto-dialogue-mode").value = s.speaker_mode;

  if (!running && !el("auto-dialogue-status")?.textContent?.includes("已暂停")) {
    updateAutoDialogueStatus("");
  }
}

function readAutoDialogueForm() {
  return {
    enabled: el("auto-dialogue-enabled").checked,
    continuous: el("auto-dialogue-continuous").checked,
    interval_sec: Number(el("auto-dialogue-interval").value),
    max_turns: Number(el("auto-dialogue-max-turns").value),
    include_referee: el("auto-dialogue-referee").checked,
    speaker_mode: el("auto-dialogue-mode").value,
  };
}

function stopAutoDialogue() {
  state.autoDialogueLoop = false;
  state.autoDialogueBurst = false;
  if (state.autoDialogueTimer) {
    clearTimeout(state.autoDialogueTimer);
    state.autoDialogueTimer = null;
  }
  setAutoDialogueControlsDisabled(false);
  if (!state.sending) {
    el("btn-send-msg").disabled = false;
  }
  updateAutoDialogueStatus("已暂停自动对话");
}

async function speakCharacterForAuto(characterId) {
  if (!state.currentSessionId || !characterId) return false;
  if (!isCharInCurrentSession(characterId)) return false;

  state.sending = true;
  el("btn-send-msg").disabled = true;
  const speakBtn = el("btn-speak-char");
  if (speakBtn) speakBtn.disabled = true;

  try {
    const data = await api(`/api/sessions/${state.currentSessionId}/speak`, {
      method: "POST",
      body: JSON.stringify({
        character_id: characterId,
        visibility: "public",
        viewers: [],
        kind: "speech",
        instruction:
          "继续场上对话，简短回应（1～2句）。可追问或反驳，不要复述人设与背景，不要跳出角色。",
      }),
    });
    if (data.truncated) {
      updateAutoDialogueStatus("回复可能被截断，可在设置中提高 Max Tokens");
    }
    state.session = await api(`/api/sessions/${state.currentSessionId}`);
    await loadMessages({ scrollToBottom: true, force: true });
    await loadSessions();
    return true;
  } catch (e) {
    updateAutoDialogueStatus(`发言失败: ${parseError(e)}`);
    return false;
  } finally {
    state.sending = false;
    if (!state.autoDialogueLoop && !state.autoDialogueBurst) {
      el("btn-send-msg").disabled = false;
    }
    if (speakBtn && isCharInCurrentSession(state.selectedCharId)) {
      speakBtn.disabled = false;
    }
  }
}

async function runOneAutoTurn() {
  const next = pickNextAutoSpeaker();
  if (!next) {
    updateAutoDialogueStatus("本群没有可发言角色");
    return false;
  }
  state.autoDialogueLastSpeakerId = next.id;
  updateAutoDialogueStatus(`${next.name} 思考中…`);
  const ok = await speakCharacterForAuto(next.id);
  if (ok) updateAutoDialogueStatus(`${next.name} 已发言`);
  return ok;
}

async function runAutoDialogueBurst(turns) {
  const settings = getAutoDialogueSettings();
  const speakers = getAutoSpeakers();
  if (!speakers.length) {
    alert("请先将角色加入本群");
    return;
  }

  const wasLoop = state.autoDialogueLoop;
  if (wasLoop) {
    state.autoDialogueLoop = false;
    if (state.autoDialogueTimer) clearTimeout(state.autoDialogueTimer);
  }

  const n = Math.min(turns ?? settings.max_turns, 30);
  state.autoDialogueBurst = true;
  setAutoDialogueControlsDisabled(true);

  for (let i = 0; i < n; i++) {
    if (!state.autoDialogueBurst) break;
    updateAutoDialogueStatus(`自动对话 ${i + 1}/${n}…`);
    const ok = await runOneAutoTurn();
    if (!ok) break;
    if (i < n - 1) await sleep(settings.interval_sec * 1000);
  }

  state.autoDialogueBurst = false;
  setAutoDialogueControlsDisabled(false);
  if (!state.autoDialogueLoop) {
    el("btn-send-msg").disabled = false;
    updateAutoDialogueStatus("本轮自动对话结束");
  }

  if (wasLoop || settings.continuous) {
    startContinuousAutoDialogue();
  }
}

function scheduleContinuousAutoTurn() {
  if (!state.autoDialogueLoop || !state.currentSessionId) return;
  const settings = getAutoDialogueSettings();
  state.autoDialogueTimer = setTimeout(async () => {
    if (!state.autoDialogueLoop) return;
    await runOneAutoTurn();
    scheduleContinuousAutoTurn();
  }, settings.interval_sec * 1000);
}

function startContinuousAutoDialogue() {
  const settings = getAutoDialogueSettings();
  const speakers = getAutoSpeakers();
  if (!speakers.length) {
    alert("请先将角色加入本群");
    return;
  }
  if (!settings.continuous) {
    return runAutoDialogueBurst(settings.max_turns);
  }

  stopAutoDialogue();
  state.autoDialogueLoop = true;
  state.autoDialogueBurst = false;
  setAutoDialogueControlsDisabled(true);
  el("btn-send-msg").disabled = true;
  updateAutoDialogueStatus("持续自动对话中…");
  scheduleContinuousAutoTurn();
}

function maybeStartContinuousOnLoad() {
  const settings = getAutoDialogueSettings();
  if (settings.continuous && getAutoSpeakers().length) {
    startContinuousAutoDialogue();
  }
}

function renderViewTabs() {
  const tabs = el("view-tabs");
  tabs.innerHTML = "";

  const views = [{ id: "public", label: "public" }, { id: "referee", label: "裁判" }, { id: "gm", label: "GM" }];

  if (state.session) {
    Object.values(state.session.characters).forEach((c) => {
      views.push({ id: c.id, label: c.name });
    });
  }

  views.forEach((v) => {
    const tab = document.createElement("span");
    tab.className = "tab" + (state.currentView === v.id ? " active" : "");
    tab.textContent = v.label;
    tab.onclick = () => {
      state.currentView = v.id;
      state.lastMessagesFingerprint = null;
      renderViewTabs();
      loadMessages({ force: true });
    };
    tabs.appendChild(tab);
  });
}

function showSessionMuteStatus(text) {
  const box = el("session-mute-status");
  if (!box) return;
  box.textContent = text;
  box.classList.remove("hidden");
  clearTimeout(state.muteStatusTimer);
  state.muteStatusTimer = setTimeout(() => {
    box.classList.add("hidden");
  }, 3500);
}

function flashSessionCharRow(charId) {
  const list = el("session-char-list");
  if (!list) return;
  const btn = list.querySelector(`.session-mute-btn[data-char-id="${CSS.escape(charId)}"]`);
  const row = btn?.closest(".session-char-item");
  if (!row) return;
  row.classList.remove("flash-muted");
  void row.offsetWidth;
  row.classList.add("flash-muted");
}

async function setCharacterMuted(charId, muted) {
  if (!state.currentSessionId || !charId) return;
  if (!isCharInCurrentSession(charId)) {
    showSessionMuteStatus("该角色不在本群");
    return;
  }
  const name = getCharDisplayName(charId);
  const muteBtn = document.querySelector(
    `.session-mute-btn[data-char-id="${CSS.escape(charId)}"]`
  );
  if (muteBtn) muteBtn.disabled = true;
  showSessionMuteStatus(`${name}：${muted ? "禁言中…" : "解除禁言…"}`);
  try {
    const data = await api(
      `/api/sessions/${state.currentSessionId}/characters/${encodeURIComponent(charId)}/mute`,
      {
        method: "PATCH",
        body: JSON.stringify({ muted }),
      }
    );
    if (state.session) {
      state.session.game_state = state.session.game_state || {};
      state.session.game_state.muted_characters = data.muted_characters || [];
    }
    showSessionMuteStatus(muted ? `「${name}」已禁言` : `「${name}」已解除禁言`);
    renderSessionCharList();
    renderCharList();
    const global = getRosterChar(state.selectedCharId);
    if (global) updateCharFormChrome(global, isCharInCurrentSession(state.selectedCharId));
    flashSessionCharRow(charId);
  } catch (e) {
    const msg = parseError(e);
    if (msg.includes("Not Found") || msg.includes("404")) {
      showSessionMuteStatus(
        "禁言接口不可用，请重启后端：python -m kryptos.main"
      );
    } else {
      showSessionMuteStatus(`操作失败: ${msg}`);
    }
  } finally {
    if (muteBtn) muteBtn.disabled = false;
  }
}

async function removeCharacterFromSession(charId) {
  if (!state.currentSessionId || !charId) return;
  const char = state.session?.characters?.[charId];
  const name = char?.name || charId;
  if (
    !confirm(
      `确定将「${name}」移出本群？\n本局的私密信息与目标仍保留在关联记录中，之后可在右侧再次加入本群。`
    )
  ) {
    return;
  }

  const leaveBtn = document.querySelector(
    `.session-leave-btn[data-char-id="${CSS.escape(charId)}"]`
  );
  if (leaveBtn) leaveBtn.disabled = true;
  showSessionMuteStatus(`「${name}」：移出本群中…`);

  try {
    await api(`/api/sessions/${state.currentSessionId}/characters/${encodeURIComponent(charId)}`, {
      method: "DELETE",
    });
    state.session = await api(`/api/sessions/${state.currentSessionId}`);
    await loadRoster();
    showSessionMuteStatus(`「${name}」已移出本群`);
    renderAll();
  } catch (e) {
    showSessionMuteStatus(`移出失败: ${parseError(e)}`);
    if (leaveBtn) leaveBtn.disabled = false;
  }
}

function renderSessionCharList() {
  const list = el("session-char-list");
  const section = el("section-session-chars");
  if (!list || !section) return;

  if (!state.session || !state.currentSessionId) {
    section.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  section.classList.remove("hidden");
  const chars = Object.values(state.session.characters);
  if (!chars.length) {
    list.innerHTML = "<li class='info-box'>暂无角色，在右侧创建并加入本群</li>";
    return;
  }

  chars.sort((a, b) => {
    if (a.is_referee !== b.is_referee) return a.is_referee ? 1 : -1;
    return (a.name || "").localeCompare(b.name || "", "zh-CN");
  });

  list.innerHTML = "";
  chars.forEach((c) => {
    const muted = isCharMuted(c.id);
    const li = document.createElement("li");
    li.className = "session-char-item" + (muted ? " muted-char" : "");
    li.innerHTML = `
      ${safeAvatarHtml(c, c.id, "sm")}
      <div class="session-char-text">
        <strong>${escapeHtml(c.name)}</strong>
        ${c.is_referee ? '<span class="session-char-tag">裁判</span>' : ""}
        ${muted ? '<span class="session-char-tag muted-tag">禁言中</span>' : ""}
      </div>
      <div class="session-char-actions">
        <button type="button" class="ghost session-mute-btn${muted ? " is-muted" : ""}" data-char-id="${escapeAttr(c.id)}">
          ${muted ? "解禁" : "禁言"}
        </button>
        <button type="button" class="ghost session-leave-btn btn-danger" data-char-id="${escapeAttr(c.id)}">移出</button>
      </div>`;
    list.appendChild(li);
  });
}

function setupSessionCharList() {
  const list = el("session-char-list");
  if (!list || list.dataset.bound) return;
  list.dataset.bound = "1";
  list.addEventListener("click", (e) => {
    const leaveBtn = e.target.closest(".session-leave-btn");
    if (leaveBtn) {
      e.preventDefault();
      e.stopPropagation();
      const charId = leaveBtn.dataset.charId;
      if (!charId) return;
      removeCharacterFromSession(charId);
      return;
    }

    const btn = e.target.closest(".session-mute-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const charId = btn.dataset.charId;
    if (!charId) return;
    setCharacterMuted(charId, !isCharMuted(charId));
  });
}

const LAYOUT_COLUMNS_KEY = "kryptos-layout-columns";
const LAYOUT_COLUMNS_DEFAULT = { left: 248, right: 320 };

function applyLayoutColumns(cols) {
  const root = document.documentElement;
  root.style.setProperty("--layout-left", `${cols.left}px`);
  root.style.setProperty("--layout-right", `${cols.right}px`);
}

function loadLayoutColumns() {
  try {
    const raw = localStorage.getItem(LAYOUT_COLUMNS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        left: Number(data.left) || LAYOUT_COLUMNS_DEFAULT.left,
        right: Number(data.right) || LAYOUT_COLUMNS_DEFAULT.right,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...LAYOUT_COLUMNS_DEFAULT };
}

function saveLayoutColumns(cols) {
  localStorage.setItem(LAYOUT_COLUMNS_KEY, JSON.stringify(cols));
}

function setupLayoutResizers() {
  const layout = document.querySelector(".layout");
  if (!layout || layout.dataset.resizersBound) return;
  layout.dataset.resizersBound = "1";

  const cols = loadLayoutColumns();
  applyLayoutColumns(cols);

  const MIN_LEFT = 180;
  const MIN_RIGHT = 220;
  const MIN_CENTER = 280;
  const RESIZER_TOTAL = 12;

  layout.querySelectorAll(".layout-resizer").forEach((resizer) => {
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const side = resizer.dataset.resizer;
      const startX = e.clientX;
      const startLeft = cols.left;
      const startRight = cols.right;
      const layoutWidth = layout.getBoundingClientRect().width;
      document.body.classList.add("layout-resizing");

      function onMove(ev) {
        const dx = ev.clientX - startX;
        const maxLeft = layoutWidth - RESIZER_TOTAL - MIN_CENTER - cols.right;
        const maxRight = layoutWidth - RESIZER_TOTAL - MIN_CENTER - cols.left;

        if (side === "left") {
          cols.left = Math.max(MIN_LEFT, Math.min(startLeft + dx, maxLeft));
        } else if (side === "right") {
          cols.right = Math.max(MIN_RIGHT, Math.min(startRight - dx, maxRight));
        }
        applyLayoutColumns(cols);
      }

      function onUp() {
        document.body.classList.remove("layout-resizing");
        saveLayoutColumns(cols);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

function renderCharList() {
  const list = el("char-list");
  list.innerHTML = "";
  if (!state.roster.length) {
    list.innerHTML = "<li class='info-box'>暂无角色，请创建</li>";
    renderViewersCheckboxes();
    updateComposerPrivateMode();
    return;
  }

  state.roster.forEach((c, rosterIndex) => {
    const li = document.createElement("li");
    li.dataset.rosterIndex = String(rosterIndex);
    li.className =
      (sameCharId(c.id, state.selectedCharId) ? "active" : "") +
      (isCharInCurrentSession(c.id) && isCharMuted(c.id) ? " muted-char" : "");
    const badges = [];
    if (c.is_referee) badges.push("裁判");
    if (isCharInCurrentSession(c.id)) {
      badges.push("在本群");
      if (isCharMuted(c.id)) badges.push("禁言");
    }
    const groupCount = c.session_ids?.length || 0;
    li.innerHTML = `
      ${safeAvatarHtml(c, c.id, "md")}
      <div class="char-text">
        <strong>${escapeHtml(c.name)}</strong>
        <div class="meta">${badges.join(" · ") || "角色"} · ${groupCount} 个群聊</div>
      </div>`;
    li.onclick = () => {
      if (sameCharId(state.selectedCharId, c.id)) {
        scrollToSidebarSection("section-char-config");
        return;
      }
      state.selectedCharId = c.id;
      state.charFormDirty = false;
      updateCharListActiveState();
      renderCharForm(true);
      updateComposerPrivateMode();
      scrollToSidebarSection("section-char-config");
    };
    list.appendChild(li);
  });

  renderViewersCheckboxes();
  updateComposerPrivateMode();
}

function renderViewersCheckboxes() {
  const box = el("viewers-checkboxes");
  box.innerHTML = "";
  if (!state.session) return;

  const target = getPrivateTargetSessionChar();
  const isRestricted = el("msg-visibility")?.value === "restricted";

  Object.values(state.session.characters).forEach((c) => {
    const checked =
      isRestricted && target && sameCharId(c.id, target.id) ? " checked" : "";
    const label = document.createElement("label");
    label.className = "checkbox-row inline";
    label.innerHTML = `<input type="checkbox" value="${escapeAttr(c.id)}" class="viewer-cb"${checked} /> ${escapeHtml(c.name)}`;
    box.appendChild(label);
  });
}

function updateAvatarPreview() {
  const preview = el("cfg-avatar-preview");
  if (!preview) return;
  const name = el("cfg-name")?.value || "?";
  const avatar_url = el("cfg-avatar")?.value || "";
  const hasImage =
    avatar_url &&
    (avatar_url.startsWith("http") ||
      avatar_url.startsWith("/") ||
      avatar_url.startsWith("data:image"));
  const isEmoji = avatar_url && !hasImage;

  if (hasImage || isEmoji) {
    preview.innerHTML = safeAvatarHtml(
      { name, avatar_url, id: state.selectedCharId || name },
      null,
      "lg"
    );
    preview.classList.add("avatar-preview--has-image");
  } else {
    preview.innerHTML = `<span class="avatar-pick-hint">点击选择图片</span>`;
    preview.classList.remove("avatar-preview--has-image");
  }
}

async function uploadAvatarFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert("图片不能超过 5MB");
    return;
  }
  const status = el("cfg-avatar-upload-status");
  const uploadBtn = el("btn-avatar-upload");
  if (status) status.textContent = "上传中…";
  if (uploadBtn) uploadBtn.disabled = true;
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await fetch("/api/assets", { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || res.statusText);
    }
    const data = await res.json();
    el("cfg-avatar").value = data.url;
    markCharFormDirty();
    updateAvatarPreview();
    if (status) status.textContent = "已上传";
  } catch (err) {
    if (status) status.textContent = "";
    alert("上传失败: " + parseError(err));
  } finally {
    if (uploadBtn) uploadBtn.disabled = false;
    const fileInput = el("cfg-avatar-file");
    if (fileInput) fileInput.value = "";
  }
}

function setupAvatarUpload() {
  const fileInput = el("cfg-avatar-file");
  const uploadBtn = el("btn-avatar-upload");
  const preview = el("cfg-avatar-preview");
  if (!fileInput || !uploadBtn) return;

  uploadBtn.addEventListener("click", () => fileInput.click());
  if (preview) {
    preview.addEventListener("click", () => fileInput.click());
    preview.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });
  }
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    await uploadAvatarFile(file);
  });
}

function renderCharForm(force = false) {
  const form = el("char-form");
  const info = el("char-config");

  if (!state.selectedCharId) {
    form.classList.add("hidden");
    info.textContent = "从角色库选择角色";
    state.lastRenderedCharId = null;
    return;
  }

  const global = getRosterChar(state.selectedCharId);
  if (!global) {
    form.classList.add("hidden");
    info.textContent = "角色不存在";
    state.lastRenderedCharId = null;
    return;
  }

  const inSession = isCharInCurrentSession(state.selectedCharId);
  const merged = inSession ? state.session.characters[state.selectedCharId] : global;
  const charChanged = state.selectedCharId !== state.lastRenderedCharId;

  form.classList.remove("hidden");

  if (!force && !charChanged && shouldSkipCharFormReset()) {
    updateCharFormChrome(global, inSession);
    return;
  }

  state.charFormDirty = false;
  state.lastRenderedCharId = state.selectedCharId;

  updateCharFormChrome(global, inSession);
  updateCharSaveReminder();

  const editableIds = [
    "cfg-name",
    "cfg-avatar",
    "cfg-persona",
    "cfg-speech-style",
    "cfg-model",
    "cfg-api-base",
    "cfg-api-key",
  ];
  editableIds.forEach((id) => setCharFieldEnabled(id, true));

  el("cfg-name").value = global.name || "";
  el("cfg-avatar").value = global.avatar_url || "";
  el("cfg-persona").value = global.persona || "";
  el("cfg-speech-style").value = global.speech_style || "";
  el("cfg-hidden").value = inSession ? merged.hidden_brief || "" : "";
  el("cfg-goals").value = inSession ? merged.goals || "" : "";
  el("cfg-model").value = global.model || "";
  el("cfg-api-base").value = global.api_base || "";
  el("cfg-api-key").value = "";
  el("cfg-api-key").placeholder = global.api_key ? "已设置，留空不修改" : "留空用全局默认";

  // ── 角色深化技能 ────────────────────────────────────────
  const rosterExt = global.extensions || {};
  el("cfg-emotion-enabled").checked = rosterExt.emotion_enabled !== false;
  el("cfg-internal-monologue").checked = rosterExt.internal_monologue === true;
  el("cfg-relationship-enabled").checked = rosterExt.relationship_enabled !== false;

  // ── 设定约束模式 ──────────────────────────────────────
  const groundingMode = rosterExt.grounding_mode || "free";
  el("cfg-grounding-grounded").checked = groundingMode === "grounded";
  el("cfg-grounding-free").checked = groundingMode !== "grounded";

  const bubbleDefaults = global.is_referee
    ? ROLE_BUBBLE_DEFAULTS["msg-referee"]
    : ROLE_BUBBLE_DEFAULTS["msg-player"];
  setBubblePickers(
    "cfg-bubble-bg",
    "cfg-bubble-bg-alpha",
    "cfg-bubble-border",
    "cfg-bubble-border-alpha",
    "cfg-bubble-preview",
    rosterExt.bubble_bg,
    rosterExt.bubble_border,
    bubbleDefaults
  );

  updateAvatarPreview();
  updateComposerPrivateMode();
}

function scrollToSidebarSection(sectionId, flash = true) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  expandSidebarSection(sectionId);

  const scrollContainer = section.closest(".panel.left, .panel.right");
  if (!scrollContainer) return;

  const containerRect = scrollContainer.getBoundingClientRect();
  const sectionRect = section.getBoundingClientRect();
  const targetTop = sectionRect.top - containerRect.top + scrollContainer.scrollTop - 10;

  scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });

  if (!flash) return;

  section.classList.remove("flash-highlight");
  void section.offsetWidth;
  section.classList.add("flash-highlight");
  section.addEventListener(
    "animationend",
    () => section.classList.remove("flash-highlight"),
    { once: true }
  );
}

function flashAvatarButton(btn) {
  if (!btn) return;
  btn.classList.remove("avatar-btn-pulse");
  void btn.offsetWidth;
  btn.classList.add("avatar-btn-pulse");
  btn.addEventListener(
    "animationend",
    () => btn.classList.remove("avatar-btn-pulse"),
    { once: true }
  );
}

function selectCharacterFromChat(charId, anchorBtn) {
  if (!charId) return;

  if (charId === "gm") {
    flashAvatarButton(anchorBtn);
    scrollToSidebarSection("section-gm-bubble");
    return;
  }

  const char = getRosterChar(charId) || getChar(charId);
  if (!char) return;

  if (!getRosterChar(charId) && char.id) {
    state.roster = [...state.roster, char];
  }

  state.selectedCharId = char.id || charId;
  state.charFormDirty = false;
  updateCharListActiveState();
  renderCharForm(true);
  flashAvatarButton(anchorBtn);
  scrollToSidebarSection("section-char-config");
  updateComposerPrivateMode();
}

function getMsgRoleClass(m, char) {
  if (m.sender_id === "gm" || m.sender_role === "gm") return "msg-gm";
  if (char?.is_referee || m.sender_id === "referee" || m.sender_role === "referee") return "msg-referee";
  return "msg-player";
}

function firstSentence(text) {
  const line = String(text || "").trim().split(/\n/)[0].trim();
  if (!line) return "";
  const m = line.match(/^[^。！？?!.]+[。！？?!.]?/u);
  const sentence = (m ? m[0] : line).trim();
  return sentence.length > 120 ? sentence.slice(0, 120) + "…" : sentence;
}

function buildCharPopoverHtml(charId) {
  if (charId === "gm") {
    return "<strong>GM（你）</strong><p class=\"pop-snippet muted\">你发送的主持/引导消息</p><p class=\"pop-hint\">点击查看右侧 GM 气泡样式</p>";
  }
  const char = getChar(charId) || getRosterChar(charId);
  if (!char) return "<span>未知发送者</span>";
  const parts = [`<strong>${escapeHtml(char.name)}</strong>`];
  if (char.is_referee) parts.push("<span class=\"pop-tag\">裁判</span>");
  const personaSnip = firstSentence(char.persona);
  if (personaSnip) {
    parts.push(`<p class="pop-snippet">${escapeHtml(personaSnip)}</p>`);
  }
  if (isCharInCurrentSession(charId)) {
    parts.push("<p class=\"pop-hint\">点击查看右侧完整配置</p>");
  } else {
    parts.push("<p class=\"pop-hint\">未在本群 · 点击在右侧打开角色</p>");
  }
  return parts.join("");
}

let popoverHideTimer = null;

function showCharPopover(anchor, charId) {
  const pop = el("char-popover");
  if (!pop || !anchor) return;
  pop.innerHTML = buildCharPopoverHtml(charId);
  pop.classList.remove("hidden");
  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + 280 > window.innerWidth) left = window.innerWidth - 288;
  if (top + 120 > window.innerHeight) top = rect.top - 6 - 100;
  pop.style.left = `${Math.max(pad, left)}px`;
  pop.style.top = `${Math.max(pad, top)}px`;
}

function hideCharPopover() {
  const pop = el("char-popover");
  if (pop) pop.classList.add("hidden");
}

async function deleteMessage(messageId, skipConfirm = false) {
  if (!state.currentSessionId || !messageId) return false;
  if (
    !skipConfirm &&
    !confirm("删除此条消息？AI 上下文将不再包含该内容，可让角色重新发言。")
  ) {
    return false;
  }
  await api(`/api/sessions/${state.currentSessionId}/messages/${messageId}`, {
    method: "DELETE",
  });
  state.lastMessagesFingerprint = null;
  state.session = await api(`/api/sessions/${state.currentSessionId}`);
  await loadMessages({ force: true });
  await loadSessions();
  return true;
}

async function respeakMessage(messageId, characterId) {
  if (!state.currentSessionId || !messageId || !characterId) return;
  if (!isCharInCurrentSession(characterId)) {
    alert("角色未在本群");
    return;
  }
  if (isCharMuted(characterId)) {
    alert("该角色已被禁言，请先解除禁言");
    return;
  }
  if (!confirm("删除此条消息并让该角色重新发言？")) return;
  const ok = await deleteMessage(messageId, true);
  if (!ok) return;
  await speakCharacter(characterId);
}

function buildMessageActionsHtml(m, char) {
  const canRespeak =
    char &&
    m.sender_id !== "gm" &&
    (m.kind === "speech" || m.kind === "whisper") &&
    isCharInCurrentSession(m.sender_id);
  const respeakBtn = canRespeak
    ? `<button type="button" class="ghost msg-action-btn" data-msg-action="respeak" data-msg-id="${escapeAttr(m.id)}" data-char-id="${escapeAttr(m.sender_id)}">重新发言</button>`
    : "";
  return `<span class="msg-actions">
    ${respeakBtn}
    <button type="button" class="ghost msg-action-btn" data-msg-action="delete" data-msg-id="${escapeAttr(m.id)}">删除</button>
  </span>`;
}

function setupTimelineInteractions() {
  const timeline = el("timeline");
  if (!timeline || timeline.dataset.bound) return;
  timeline.dataset.bound = "1";

  timeline.addEventListener("mouseover", (e) => {
    const btn = e.target.closest(".avatar-btn");
    if (!btn) return;
    if (popoverHideTimer) {
      clearTimeout(popoverHideTimer);
      popoverHideTimer = null;
    }
    showCharPopover(btn, btn.dataset.charId || "");
  });

  timeline.addEventListener("mouseout", (e) => {
    const btn = e.target.closest(".avatar-btn");
    if (!btn) return;
    const related = e.relatedTarget;
    if (related && btn.contains(related)) return;
    popoverHideTimer = setTimeout(() => {
      popoverHideTimer = null;
      hideCharPopover();
    }, 120);
  });

  timeline.addEventListener("click", (e) => {
    const actionBtn = e.target.closest("[data-msg-action]");
    if (actionBtn) {
      e.preventDefault();
      const msgId = actionBtn.dataset.msgId;
      const action = actionBtn.dataset.msgAction;
      if (action === "delete") {
        deleteMessage(msgId);
      } else if (action === "respeak") {
        respeakMessage(msgId, actionBtn.dataset.charId);
      }
      return;
    }

    const toggle = e.target.closest(".msg-reasoning-toggle");
    if (toggle) {
      e.preventDefault();
      const rid = toggle.dataset.reasoningId;
      const body = rid ? document.getElementById(rid) : null;
      if (!body) return;
      const willExpand = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", willExpand ? "true" : "false");
      body.classList.toggle("hidden", !willExpand);
      if (willExpand) state.expandedReasoningIds.add(rid);
      else state.expandedReasoningIds.delete(rid);
      return;
    }

    const btn = e.target.closest(".avatar-btn");
    if (!btn) return;
    e.preventDefault();
    hideCharPopover();
    selectCharacterFromChat(btn.dataset.charId || "", btn);
  });
}

document.addEventListener("mousedown", (e) => {
  if (!e.target.closest("#timeline") && !e.target.closest("#char-popover")) {
    hideCharPopover();
  }
});

function messagesFingerprint(messages) {
  return messages
    .map((m) => `${m.id}|${m.content?.length ?? 0}|${(m.reasoning_content || "").length}`)
    .join("\n");
}

function updateChatEmptyBrand() {
  const brand = el("chat-empty-brand");
  if (!brand) return;
  const show = !state.currentSessionId;
  brand.classList.toggle("hidden", !show);
  brand.setAttribute("aria-hidden", show ? "false" : "true");
}

async function loadMessages(options = {}) {
  if (!state.currentSessionId) {
    el("timeline").innerHTML = "";
    state.lastMessagesFingerprint = null;
    updateChatEmptyBrand();
    return;
  }

  updateChatEmptyBrand();

  const messages = await api(
    `/api/sessions/${state.currentSessionId}/messages?view=${encodeURIComponent(state.currentView)}`
  );

  const fingerprint = messagesFingerprint(messages);
  if (!options.force && fingerprint === state.lastMessagesFingerprint) {
    return;
  }
  state.lastMessagesFingerprint = fingerprint;

  const timeline = el("timeline");
  const wasNearBottom =
    timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 80;
  const prevScrollTop = timeline.scrollTop;
  timeline.innerHTML = "";

  if (messages.length === 0) {
    timeline.innerHTML = "<div class='info-box'>此视角暂无可见消息</div>";
    return;
  }

  messages.forEach((m) => {
    const char = getChar(m.sender_id);
    const roleClass = getMsgRoleClass(m, char);
    const div = document.createElement("div");
    div.className =
      "msg " +
      roleClass +
      (m.visibility === "restricted" ? " restricted" : "") +
      (m.visibility === "system" ? " system" : "");
    div.dataset.msgId = m.id;

    const senderName = char?.name || (m.sender_id === "gm" ? "GM" : m.sender_id);
    const time = new Date(m.created_at).toLocaleTimeString();
    const avatarCharId = m.sender_id === "gm" ? "gm" : char?.id || m.sender_id;
    const avatarInner = char
      ? safeAvatarButton(char, char.id, "lg", avatarCharId)
      : safeAvatarButton(senderName, m.sender_id, "lg", avatarCharId);

    const truncatedTag = m.action_payload?.truncated
      ? '<span class="tag truncated">截断</span>'
      : "";

    // ── 情绪标签 ────────────────────────────────────────
    let emotionTag = "";
    if (m.emotion && m.emotion.dominant) {
      const e = m.emotion;
      const level = e.intensity >= 0.6 ? "强" : e.intensity >= 0.3 ? "中" : "弱";
      const cls = e.dominant === "neutral" ? ' style="opacity:0.4"' : "";
      emotionTag = `<span class="msg-emotion-badge"${cls} title="情绪: ${e.label} (${level})">${e.label}</span>`;
    }

    div.innerHTML = `
      <div class="msg-row">
        ${avatarInner}
        <div class="msg-body">
          <div class="msg-header">
            <span class="msg-speaker">${escapeHtml(senderName)}</span>
            ${emotionTag}
            <span class="tag ${m.visibility}">${m.visibility}</span>
            <span class="tag">${m.kind}</span>
            ${truncatedTag}
            <span>${time}</span>
            ${buildMessageActionsHtml(m, char)}
          </div>
          ${buildReasoningHtml(m)}
          <div class="msg-content">${formatMessageHtml(m.content)}</div>
        </div>
      </div>`;
    applyBubbleStyleToElement(div, getMessageBubbleStyle(m.sender_id, char));
    timeline.appendChild(div);
  });

  if (options.scrollToBottom || wasNearBottom) {
    timeline.scrollTop = timeline.scrollHeight;
  } else {
    timeline.scrollTop = prevScrollTop;
  }
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function buildReasoningHtml(m) {
  const reasoning = (m.reasoning_content || "").trim();
  if (!reasoning) return "";
  const rid = `reasoning-${m.id}`;
  const isExpanded = state.expandedReasoningIds.has(rid);
  return `
    <div class="msg-reasoning">
      <button type="button" class="msg-reasoning-toggle ghost" aria-expanded="${isExpanded ? "true" : "false"}" data-reasoning-id="${escapeAttr(rid)}">
        <span class="msg-reasoning-label">深度思考</span>
        <span class="msg-reasoning-chevron" aria-hidden="true">▼</span>
      </button>
      <div id="${escapeAttr(rid)}" class="msg-reasoning-body${isExpanded ? "" : " hidden"}">${formatMessageHtml(reasoning)}</div>
    </div>`;
}

function renderAll(forceCharForm = true) {
  renderAutoDialogueForm();
  renderViewTabs();
  renderSessionCharList();
  renderWorldBookSection();
  renderCharList();
  renderCharForm(forceCharForm);
  updateComposerPrivateMode();
  updateChatEmptyBrand();
  loadMessages();
  loadSessions();
}

function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    if (state.currentSessionId && !state.sending) loadMessages();
  }, 3000);
}

async function speakCharacter(characterId, options = {}) {
  if (!state.currentSessionId || !characterId) {
    alert("请先选择角色");
    return;
  }
  if (!isCharInCurrentSession(characterId)) {
    alert("请先将角色加入本群");
    return;
  }
  if (isCharMuted(characterId)) {
    alert("该角色在本群已被禁言");
    return;
  }
  const visibility = options.visibility ?? el("msg-visibility").value;
  const viewers =
    options.viewers ??
    (visibility === "restricted" ? getCheckedViewerIds() : []);
  const instruction = options.instruction ?? "";

  state.sending = true;
  el("btn-send-msg").disabled = true;
  const speakBtn = el("btn-speak-char");
  if (speakBtn) speakBtn.disabled = true;

  try {
    const data = await api(`/api/sessions/${state.currentSessionId}/speak`, {
      method: "POST",
      body: JSON.stringify({
        character_id: characterId,
        visibility,
        viewers,
        kind: options.kind ?? el("msg-kind").value,
        instruction,
      }),
    });
    if (data.truncated) {
      updateAutoDialogueStatus("回复可能被截断，可在设置中提高 Max Tokens");
    }
    state.session = await api(`/api/sessions/${state.currentSessionId}`);
    await loadMessages({ scrollToBottom: true, force: true });
    await loadSessions();
  } catch (e) {
    alert("角色发言失败: " + parseError(e));
  } finally {
    state.sending = false;
    el("btn-send-msg").disabled = false;
    if (speakBtn) speakBtn.disabled = false;
  }
}

el("msg-visibility").addEventListener("change", () => {
  updateComposerPrivateMode();
});

el("btn-toggle-advanced").addEventListener("click", () => {
  el("composer-advanced").classList.toggle("hidden");
});

el("cfg-avatar").addEventListener("input", () => {
  markCharFormDirty();
  updateAvatarPreview();
});
el("cfg-name").addEventListener("input", () => {
  markCharFormDirty();
  updateAvatarPreview();
});

[
  "cfg-persona",
  "cfg-speech-style",
  "cfg-hidden",
  "cfg-goals",
  "cfg-model",
  "cfg-api-base",
  "cfg-api-key",
  "cfg-emotion-enabled",
  "cfg-internal-monologue",
  "cfg-relationship-enabled",
  "cfg-grounding-grounded",
  "cfg-grounding-free",
].forEach((id) => {
  const field = el(id);
  if (field) field.addEventListener("input", markCharFormDirty);
});

el("btn-create-session").onclick = async () => {
  const title = el("new-session-title").value.trim() || "新局";
  const session = await api("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ title, template_id: "" }),
  });
  el("new-session-title").value = "";
  await selectSession(session.id);
};

el("btn-add-char").onclick = async () => {
  if (!state.currentSessionId) return alert("请先选择会话");
  const name = el("new-char-name").value.trim();
  if (!name) return alert("请输入角色名");
  const is_referee = el("new-char-referee").checked;
  const created = await api(`/api/sessions/${state.currentSessionId}/characters`, {
    method: "POST",
    body: JSON.stringify({ name, is_referee, can_host: is_referee }),
  });
  el("new-char-name").value = "";
  el("new-char-referee").checked = false;
  state.session = await api(`/api/sessions/${state.currentSessionId}`);
  state.selectedCharId = created.id;
  await loadRoster();
  renderAll();
};

el("btn-join-char").onclick = async () => {
  if (!state.currentSessionId || !state.selectedCharId) return;
  await api(`/api/sessions/${state.currentSessionId}/characters/join`, {
    method: "POST",
    body: JSON.stringify({ character_id: state.selectedCharId }),
  });
  state.session = await api(`/api/sessions/${state.currentSessionId}`);
  await loadRoster();
  renderAll();
};

el("btn-delete-session").onclick = async () => {
  if (!state.currentSessionId) return;
  const title = state.session?.title || "当前群聊";
  if (
    !confirm(
      `确定删除群聊「${title}」？\n将永久删除该群所有消息记录，且无法恢复。`
    )
  ) {
    return;
  }
  await api(`/api/sessions/${state.currentSessionId}`, { method: "DELETE" });
  stopAutoDialogue();
  state.currentSessionId = null;
  state.session = null;
  await loadRoster();
  await loadSessions();
  renderAutoDialogueForm();
  renderViewTabs();
  renderCharList();
  renderCharForm();
  updateComposerPrivateMode();
  updateChatEmptyBrand();
  el("timeline").innerHTML = "";
};

el("btn-delete-char").onclick = async () => {
  if (!state.selectedCharId) return;
  const name = getRosterChar(state.selectedCharId)?.name || state.selectedCharId;
  if (
    !confirm(
      `确定从角色库删除「${name}」？\n将从所有群聊移出该角色，角色数据不可恢复。历史消息中的发言记录仍会保留。`
    )
  ) {
    return;
  }
  await api(`/api/characters/${state.selectedCharId}`, { method: "DELETE" });
  if (state.currentSessionId) {
    state.session = await api(`/api/sessions/${state.currentSessionId}`);
  }
  state.selectedCharId = null;
  await loadRoster();
  renderAll();
};

el("btn-save-auto-dialogue").onclick = async () => {
  if (!state.currentSessionId) return;
  const body = readAutoDialogueForm();
  await api(`/api/sessions/${state.currentSessionId}/auto-dialogue`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  state.session = await api(`/api/sessions/${state.currentSessionId}`);
  const wasRunning = state.autoDialogueLoop;
  stopAutoDialogue();
  renderAutoDialogueForm();
  if (body.continuous) maybeStartContinuousOnLoad();
  else if (wasRunning) updateAutoDialogueStatus("设置已保存，自动对话已暂停");
  alert("对话设置已保存");
};

el("btn-start-auto-dialogue").onclick = async () => {
  if (!state.currentSessionId) return;
  const settings = getAutoDialogueSettings();
  if (settings.continuous) startContinuousAutoDialogue();
  else await runAutoDialogueBurst(settings.max_turns);
};

el("btn-stop-auto-dialogue").onclick = () => stopAutoDialogue();

el("btn-send-msg").onclick = async () => {
  if (!state.currentSessionId) return alert("请先选择会话");
  const content = el("msg-content").value.trim();
  if (!content) return alert("请输入消息内容");

  const visibility = el("msg-visibility").value;
  let viewers = [];
  if (visibility === "restricted") {
    syncRestrictedViewersToSelectedChar();
    const targetId = getPrivateReplyTargetCharId();
    if (!targetId) {
      return alert("私密消息：请先在右侧选择要私聊的角色（须已加入本群）");
    }
    viewers = [targetId];
  }

  const replyAfter = el("chk-reply-after-send").checked;

  state.sending = true;
  el("btn-send-msg").disabled = true;

  try {
    await api(`/api/sessions/${state.currentSessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content,
        kind: el("msg-kind").value,
        visibility,
        viewers,
        phase_id: state.session?.current_phase_id || "",
        sender_id: "gm",
        sender_role: "gm",
      }),
    });

    el("msg-content").value = "";
    state.session = await api(`/api/sessions/${state.currentSessionId}`);
    await loadMessages({ scrollToBottom: true, force: true });
    await loadSessions();
    updateComposerPrivateMode();

    if (replyAfter) {
      if (visibility === "restricted") {
        await replyAfterRestrictedMessage(viewers);
      } else {
        const ad = getAutoDialogueSettings();
        const replyCharId = state.selectedCharId;
        if (ad.enabled) {
          await runAutoDialogueBurst(ad.max_turns);
        } else if (replyCharId && isCharInCurrentSession(replyCharId)) {
          if (isCharMuted(replyCharId)) {
            alert("选中角色已被禁言，已跳过自动回复");
          } else {
            await speakCharacter(replyCharId);
          }
        } else if (replyCharId) {
          alert("选中角色未加入本群，已跳过自动回复");
        }
      }
    }
  } catch (e) {
    alert("发送失败: " + parseError(e));
  } finally {
    state.sending = false;
    el("btn-send-msg").disabled = false;
  }
};

el("btn-save-char").onclick = async () => {
  if (!state.selectedCharId) return;
  const name = el("cfg-name").value.trim();
  if (!name) return alert("名称不能为空");

  const globalChar = getRosterChar(state.selectedCharId);
  const extensions = { ...(globalChar?.extensions || {}) };
  extensions.bubble_bg = rgbaFromHex(
    el("cfg-bubble-bg").value,
    Number(el("cfg-bubble-bg-alpha").value)
  );
  extensions.bubble_border = rgbaFromHex(
    el("cfg-bubble-border").value,
    Number(el("cfg-bubble-border-alpha").value)
  );
  // ── 角色深化技能 ──────────────────────────────────────
  extensions.emotion_enabled = el("cfg-emotion-enabled").checked;
  extensions.internal_monologue = el("cfg-internal-monologue").checked;
  extensions.relationship_enabled = el("cfg-relationship-enabled").checked;
  extensions.grounding_mode = el("cfg-grounding-grounded").checked ? "grounded" : "free";

  const globalBody = {
    name,
    avatar_url: el("cfg-avatar").value,
    persona: el("cfg-persona").value,
    speech_style: el("cfg-speech-style").value,
    model: el("cfg-model").value,
    api_base: el("cfg-api-base").value,
    extensions,
  };
  const key = el("cfg-api-key").value;
  if (key) globalBody.api_key = key;

  await api(`/api/characters/${state.selectedCharId}`, {
    method: "PATCH",
    body: JSON.stringify(globalBody),
  });

  if (state.currentSessionId && isCharInCurrentSession(state.selectedCharId)) {
    await api(`/api/sessions/${state.currentSessionId}/characters/${state.selectedCharId}`, {
      method: "PATCH",
      body: JSON.stringify({
        hidden_brief: el("cfg-hidden").value,
        goals: el("cfg-goals").value,
      }),
    });
    state.session = await api(`/api/sessions/${state.currentSessionId}`);
  }

  await loadRoster();
  state.charFormDirty = false;
  updateCharSaveReminder();
  renderAll(true);
  alert("已保存");
};

el("btn-speak-char").onclick = () => {
  const vis = el("msg-visibility").value;
  if (vis === "restricted") {
    const targetId = getPrivateReplyTargetCharId();
    if (!targetId) return alert("请先在右侧选择要私聊的角色（须已加入本群）");
    speakCharacter(targetId, privateReplyOptionsFor(targetId));
  } else {
    if (!state.selectedCharId) return alert("请先选择角色");
    speakCharacter(state.selectedCharId);
  }
};

el("btn-preview-context").onclick = async () => {
  if (!state.currentSessionId) return;
  const viewer = state.selectedCharId || state.currentView;
  const data = await api(
    `/api/sessions/${state.currentSessionId}/context/${encodeURIComponent(viewer)}`
  );
  el("context-preview").textContent = JSON.stringify(data, null, 2);
};

el("btn-refresh").onclick = () => loadMessages({ force: true });

function wireBubbleLive(previewId, bgColorId, bgAlphaId, borderColorId, borderAlphaId, onDirty) {
  [bgColorId, bgAlphaId, borderColorId, borderAlphaId].forEach((id) => {
    const field = el(id);
    if (!field) return;
    field.addEventListener("input", () => {
      updateBubblePreview(previewId, bgColorId, bgAlphaId, borderColorId, borderAlphaId);
      if (onDirty) onDirty();
    });
  });
}

function initGmBubbleForm() {
  const gm = loadGmBubble();
  const defaults = ROLE_BUBBLE_DEFAULTS["msg-gm"];
  setBubblePickers(
    "gm-bubble-bg",
    "gm-bubble-bg-alpha",
    "gm-bubble-border",
    "gm-bubble-border-alpha",
    "gm-bubble-preview",
    gm?.bg,
    gm?.border,
    defaults
  );

  wireBubbleLive(
    "cfg-bubble-preview",
    "cfg-bubble-bg",
    "cfg-bubble-bg-alpha",
    "cfg-bubble-border",
    "cfg-bubble-border-alpha",
    markCharFormDirty
  );
  wireBubbleLive(
    "gm-bubble-preview",
    "gm-bubble-bg",
    "gm-bubble-bg-alpha",
    "gm-bubble-border",
    "gm-bubble-border-alpha"
  );

  el("btn-save-gm-bubble").onclick = () => {
    const { bg, border } = readBubblePickers(
      "gm-bubble-bg",
      "gm-bubble-bg-alpha",
      "gm-bubble-border",
      "gm-bubble-border-alpha"
    );
    saveGmBubble(bg, border);
    loadMessages({ force: true });
    alert("GM 气泡已保存");
  };
}

initGmBubbleForm();

async function init() {
  setupTimelineInteractions();
  setupComposerInteractions();
  setupAvatarUpload();
  setupSessionCharList();
  setupLayoutResizers();
  setupSidebarSections();
  setupWorldBook();
  await loadRoster();
  await loadSessions();
  if (!state.selectedCharId && state.roster.length) {
    state.selectedCharId = state.roster[0].id;
  }
  renderSessionCharList();
  renderCharList();
  renderCharForm(true);
  updateChatEmptyBrand();
}

init();
