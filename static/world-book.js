/** Per-session world book UI (lore entries injected into AI context). */

function wbEl(id) {
  return document.getElementById(id);
}

function getWorldBookFromSession() {
  const raw = state.session?.game_state?.world_book;
  if (!raw) {
    return { entries: [], scan_depth: 40, max_chars: 3500 };
  }
  return {
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    scan_depth: Number(raw.scan_depth) || 40,
    max_chars: Number(raw.max_chars) || 3500,
  };
}

function worldBookViewerId() {
  if (state.selectedCharId && isCharInCurrentSession(state.selectedCharId)) {
    return state.selectedCharId;
  }
  return "gm";
}

function showWorldBookStatus(text) {
  const box = wbEl("world-book-status");
  if (!box) return;
  if (!text) {
    box.classList.add("hidden");
    box.textContent = "";
    return;
  }
  box.textContent = text;
  box.classList.remove("hidden");
}

function keysToInput(keys) {
  if (!keys || !keys.length) return "";
  return keys.join("，");
}

function keysFromInput(text) {
  if (!text || !String(text).trim()) return [];
  return String(text)
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function newLocalWorldBookEntry(book) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `wb_${Date.now().toString(36)}_${suffix}`,
    title: "新词条",
    content: "",
    keys: [],
    constant: false,
    enabled: true,
    order: book.entries.length,
  };
}

function applyWorldBookData(data) {
  if (!state.session) return;
  state.session.game_state = state.session.game_state || {};
  state.session.game_state.world_book = {
    entries: data.entries || [],
    scan_depth: data.scan_depth ?? 40,
    max_chars: data.max_chars ?? 3500,
  };
}

function isApiNotFoundError(err) {
  const msg = parseError(err);
  return msg.includes("Not Found") || msg.includes("404");
}

async function loadWorldBookIntoSession() {
  if (!state.currentSessionId || !state.session) return false;
  try {
    const data = await api(`/api/sessions/${state.currentSessionId}/world-book`);
    applyWorldBookData(data);
    return true;
  } catch {
    return false;
  }
}

function updateWorldBookListHeader(count) {
  const head = wbEl("world-book-list-header");
  if (head) head.textContent = count ? `共 ${count} 条词条` : "暂无词条";
}

function worldBookSummaryMeta(entry) {
  const parts = [];
  if (entry.constant) parts.push("常驻");
  if (!entry.enabled) parts.push("停用");
  if (entry.keys?.length) {
    const keys = entry.keys.slice(0, 4).join("·");
    parts.push(entry.keys.length > 4 ? `${keys}…` : keys);
  } else if (!entry.constant) {
    parts.push("无触发词");
  }
  return parts.join(" · ") || "点击展开编辑";
}

function renderWorldBookSection() {
  const section = wbEl("section-world-book");
  const list = wbEl("world-book-list");
  if (!section || !list) return;

  if (!state.session || !state.currentSessionId) {
    section.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  section.classList.remove("hidden");
  const book = getWorldBookFromSession();
  const scanInput = wbEl("world-book-scan-depth");
  if (scanInput) scanInput.value = String(book.scan_depth);
  updateWorldBookListHeader(book.entries.length);

  if (!book.entries.length) {
    list.innerHTML = "<li class='info-box'>暂无词条。点「添加词条」创建世界观、地点、规则等。</li>";
  } else {
    list.innerHTML = "";
    book.entries
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .forEach((entry) => {
        const li = document.createElement("li");
        const isOpen = state.expandedWorldBookIds.has(entry.id);
        li.className = "world-book-entry" + (isOpen ? " world-book-entry--open" : "");
        li.dataset.entryId = entry.id;
        const title = entry.title || "未命名";
        const meta = worldBookSummaryMeta(entry);
        li.innerHTML = `
          <button type="button" class="world-book-summary" aria-expanded="${isOpen ? "true" : "false"}">
            <span class="world-book-chevron" aria-hidden="true">▶</span>
            <span class="world-book-summary-main">
              <strong class="world-book-entry-title">${escapeHtml(title)}</strong>
              <span class="world-book-summary-meta">${escapeHtml(meta)}</span>
            </span>
          </button>
          <div class="world-book-body${isOpen ? "" : " hidden"}">
            <label class="field compact-field">
              <span class="field-label">标题</span>
              <input type="text" class="wb-title" value="${escapeAttr(entry.title || "")}" placeholder="如：学校规则" />
            </label>
            <label class="field compact-field">
              <span class="field-label">触发词</span>
              <input type="text" class="wb-keys" value="${escapeAttr(keysToInput(entry.keys))}" placeholder="逗号分隔，如：礼堂,校长" />
            </label>
            <div class="world-book-checks">
              <label class="checkbox-row">
                <input type="checkbox" class="wb-constant" ${entry.constant ? "checked" : ""} /> 常驻
              </label>
              <label class="checkbox-row">
                <input type="checkbox" class="wb-enabled" ${entry.enabled ? "checked" : ""} /> 启用
              </label>
            </div>
            <label class="field compact-field">
              <span class="field-label">内容</span>
              <textarea class="wb-content" rows="4" placeholder="设定正文…">${escapeHtml(entry.content || "")}</textarea>
            </label>
            <button type="button" class="ghost world-book-del-btn" data-entry-id="${escapeAttr(entry.id)}">删除词条</button>
          </div>`;
        list.appendChild(li);
      });
  }

  refreshWorldBookActiveCount();
}

async function refreshWorldBookActiveCount() {
  const label = wbEl("world-book-active-count");
  if (!label || !state.currentSessionId) return;
  try {
    const viewer = worldBookViewerId();
    const data = await api(
      `/api/sessions/${state.currentSessionId}/world-book?view=${encodeURIComponent(viewer)}`
    );
    const names = (data.active_entry_ids || [])
      .map((id) => {
        const e = (data.entries || []).find((x) => x.id === id);
        return e?.title || id;
      })
      .filter(Boolean);
    label.textContent = `当前注入 ${data.active_count || 0} 条`;
    label.title = names.length ? `已注入：${names.join("、")}` : "无匹配词条";
  } catch {
    const book = getWorldBookFromSession();
    label.textContent = `共 ${book.entries.length} 条（未连上世界书 API）`;
    label.title = "请重启后端后刷新";
  }
}

function readWorldBookFromDom() {
  const book = getWorldBookFromSession();
  const scanInput = wbEl("world-book-scan-depth");
  const scan_depth = Math.min(120, Math.max(5, Number(scanInput?.value) || 40));
  const entries = [];
  wbEl("world-book-list")
    ?.querySelectorAll(".world-book-entry")
    .forEach((li, index) => {
      const id = li.dataset.entryId;
      if (!id) return;
      entries.push({
        id,
        title: li.querySelector(".wb-title")?.value?.trim() || "",
        content: li.querySelector(".wb-content")?.value?.trim() || "",
        keys: keysFromInput(li.querySelector(".wb-keys")?.value || ""),
        constant: li.querySelector(".wb-constant")?.checked || false,
        enabled: li.querySelector(".wb-enabled")?.checked ?? true,
        order: index,
      });
    });
  return { entries, scan_depth, max_chars: book.max_chars };
}

async function saveWorldBook() {
  if (!state.currentSessionId) return;
  showWorldBookStatus("保存中…");
  try {
    const body = readWorldBookFromDom();
    const data = await api(`/api/sessions/${state.currentSessionId}/world-book`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    applyWorldBookData(data);
    showWorldBookStatus("世界书已保存");
    renderWorldBookSection();
    setTimeout(() => showWorldBookStatus(""), 2500);
  } catch (e) {
    if (isApiNotFoundError(e)) {
      showWorldBookStatus(
        "保存失败：后端未加载世界书接口。请先关闭旧进程再运行 python -m kryptos.main"
      );
    } else {
      showWorldBookStatus(`保存失败: ${parseError(e)}`);
    }
  }
}

async function addWorldBookEntry() {
  if (!state.currentSessionId) {
    showWorldBookStatus("请先选择群聊");
    return;
  }
  const book = getWorldBookFromSession();
  showWorldBookStatus("添加中…");
  try {
    const data = await api(`/api/sessions/${state.currentSessionId}/world-book/entries`, {
      method: "POST",
      body: JSON.stringify({
        title: "新词条",
        content: "",
        keys: [],
        constant: false,
        enabled: true,
        order: book.entries.length,
      }),
    });
    applyWorldBookData(data);
    const newId = data.entry?.id || data.entries?.[data.entries.length - 1]?.id;
    if (newId) state.expandedWorldBookIds.add(newId);
    renderWorldBookSection();
    showWorldBookStatus("已添加，编辑后请点击「保存」");
  } catch (e) {
    if (isApiNotFoundError(e)) {
      const entry = newLocalWorldBookEntry(book);
      book.entries.push(entry);
      applyWorldBookData(book);
      state.expandedWorldBookIds.add(entry.id);
      renderWorldBookSection();
      showWorldBookStatus("已添加（仅本地）。请点「保存」；若仍失败请重启后端");
    } else {
      showWorldBookStatus(`添加失败: ${parseError(e)}`);
    }
  }
}

async function deleteWorldBookEntry(entryId) {
  if (!state.currentSessionId || !entryId) return;
  if (!confirm("删除该词条？")) return;
  showWorldBookStatus("删除中…");
  try {
    const data = await api(
      `/api/sessions/${state.currentSessionId}/world-book/entries/${encodeURIComponent(entryId)}`,
      { method: "DELETE" }
    );
    applyWorldBookData(data);
    renderWorldBookSection();
    showWorldBookStatus("已删除");
    setTimeout(() => showWorldBookStatus(""), 2000);
  } catch (e) {
    if (isApiNotFoundError(e)) {
      const book = getWorldBookFromSession();
      book.entries = book.entries.filter((e) => e.id !== entryId);
      applyWorldBookData(book);
      state.expandedWorldBookIds.delete(entryId);
      renderWorldBookSection();
      showWorldBookStatus("已从列表移除（本地）。重启后端后点保存以同步数据库");
    } else {
      showWorldBookStatus(`删除失败: ${parseError(e)}`);
    }
  }
}

function setupWorldBook() {
  const list = wbEl("world-book-list");
  if (list && !list.dataset.bound) {
    list.dataset.bound = "1";
    list.addEventListener("click", (e) => {
      const summary = e.target.closest(".world-book-summary");
      if (summary) {
        e.preventDefault();
        const li = summary.closest(".world-book-entry");
        const id = li?.dataset.entryId;
        const body = li?.querySelector(".world-book-body");
        if (!li || !body || !id) return;
        const willOpen = body.classList.contains("hidden");
        body.classList.toggle("hidden", !willOpen);
        li.classList.toggle("world-book-entry--open", willOpen);
        summary.setAttribute("aria-expanded", willOpen ? "true" : "false");
        if (willOpen) state.expandedWorldBookIds.add(id);
        else state.expandedWorldBookIds.delete(id);
        return;
      }
      const btn = e.target.closest(".world-book-del-btn");
      if (!btn) return;
      e.preventDefault();
      deleteWorldBookEntry(btn.dataset.entryId);
    });
    list.addEventListener("input", (e) => {
      const titleInput = e.target.closest(".wb-title");
      if (!titleInput) return;
      const li = titleInput.closest(".world-book-entry");
      const titleEl = li?.querySelector(".world-book-summary .world-book-entry-title");
      if (titleEl) titleEl.textContent = titleInput.value.trim() || "未命名";
    });
  }

  wbEl("btn-add-world-entry")?.addEventListener("click", () => addWorldBookEntry());
  wbEl("btn-save-world-book")?.addEventListener("click", () => saveWorldBook());
}
