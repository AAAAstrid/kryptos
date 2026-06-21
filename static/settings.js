const COLOR_INPUT_IDS = {
  "--bg": "theme-color-bg",
  "--panel": "theme-color-panel",
  "--text": "theme-color-text",
  "--accent": "theme-color-accent",
};

const SWATCH_IDS = {
  "--bg": "swatch-bg",
  "--panel": "swatch-panel",
  "--text": "swatch-text",
  "--accent": "swatch-accent",
};

let currentPreset = "dark";
let settingsControlsBound = false;

function el(id) {
  return document.getElementById(id);
}

function readColorInputs() {
  const colors = defaultColorsForPreset(currentPreset);
  Object.entries(COLOR_INPUT_IDS).forEach(([key, inputId]) => {
    const input = el(inputId);
    if (input?.value) {
      const hex = parseColorToHex(input.value);
      if (hex) colors[key] = hex;
    }
  });
  return colors;
}

function setColorInputs(colors, preset = currentPreset) {
  const merged = { ...defaultColorsForPreset(preset), ...(colors || {}) };
  Object.entries(COLOR_INPUT_IDS).forEach(([key, inputId]) => {
    const input = el(inputId);
    const swatch = el(SWATCH_IDS[key]);
    const hex = parseColorToHex(merged[key]) || merged[key];
    if (input) input.value = hex;
    if (swatch) swatch.style.background = hex;
  });
  updateFontPreview();
}

function updateThemeSwatches() {
  Object.entries(SWATCH_IDS).forEach(([key, swatchId]) => {
    const swatch = el(swatchId);
    const input = el(COLOR_INPUT_IDS[key]);
    if (!swatch || !input) return;
    swatch.style.background = input.value;
  });
  updateFontPreview();
}

function readFontInputs() {
  const familyKey = el("theme-font-family")?.value || DEFAULT_FONT.familyKey;
  const customFamily = el("theme-font-custom")?.value || "";
  const fontUrl = el("theme-font-url")?.value || "";
  const fontFaceName = el("theme-font-face-name")?.value || "";
  const sizePercent = Number(el("theme-font-size")?.value) || DEFAULT_FONT.sizePercent;
  return normalizeFontSettings({ familyKey, sizePercent, customFamily, fontUrl, fontFaceName });
}

function stripCssFamilyName(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/^["']|["']$/g, "").split(",")[0].trim();
}

function toggleFontCustomBlock(show) {
  const field = el("theme-font-custom-field");
  if (field) field.classList.toggle("hidden", !show);
}

function setFontInputs(font) {
  const normalized = normalizeFontSettings(font || DEFAULT_FONT);
  const familySel = el("theme-font-family");
  const customInput = el("theme-font-custom");
  const urlInput = el("theme-font-url");
  const faceInput = el("theme-font-face-name");
  const sizeInput = el("theme-font-size");
  const sizeLabel = el("theme-font-size-val");
  if (normalized.familyKey === "upload") ensureUploadSelectOption();
  if (familySel) familySel.value = normalized.familyKey;
  if (urlInput) urlInput.value = normalized.fontUrl || "";
  if (faceInput) faceInput.value = normalized.fontFaceName || "";
  toggleFontCustomBlock(normalized.familyKey === "custom" || normalized.familyKey === "upload");
  if (customInput) {
    if (normalized.familyKey === "upload") {
      customInput.value = normalized.fontFaceName || "";
      customInput.placeholder = "已上传字体（显示名）";
      setFontUploadStatus(normalized.fontUrl ? "已使用上传的字体文件" : "");
    } else {
      customInput.value = stripCssFamilyName(normalized.customFamily);
      customInput.placeholder = "搜索或选择本机字体…";
      setFontUploadStatus("");
    }
  }
  if (sizeInput) sizeInput.value = String(normalized.sizePercent);
  if (sizeLabel) sizeLabel.textContent = `${normalized.sizePercent}%`;
  updateFontPreview();
}

function updateFontPreview() {
  const preview = el("theme-font-preview");
  if (!preview) return;
  const font = readFontInputs();
  preview.style.fontFamily = resolveFontFamily(font);
  preview.style.fontSize = `${font.sizePercent}%`;
}

function readGlowInputs() {
  const enabled = el("theme-glow-enabled")?.checked !== false;
  const intensity = Number(el("theme-glow-intensity")?.value);
  return normalizeGlowSettings({
    enabled,
    intensity: Number.isFinite(intensity) ? intensity : DEFAULT_GLOW.intensity,
  });
}

function setGlowInputs(glow) {
  const normalized = normalizeGlowSettings(glow || DEFAULT_GLOW);
  const enabledInput = el("theme-glow-enabled");
  const intensityInput = el("theme-glow-intensity");
  const intensityLabel = el("theme-glow-intensity-val");
  if (enabledInput) enabledInput.checked = normalized.enabled;
  if (intensityInput) {
    intensityInput.value = String(normalized.intensity);
    intensityInput.disabled = !normalized.enabled;
  }
  if (intensityLabel) intensityLabel.textContent = `${normalized.intensity}%`;
}

function previewCurrentTheme() {
  const glow = readGlowInputs();
  const colors = readColorInputs();
  const font = readFontInputs();
  applyThemeBundle(currentPreset, colors, font, glow);
  updateThemeSwatches();
}

function showPresetUI(preset) {
  currentPreset = preset;
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.classList.toggle("active-preset", btn.dataset.preset === preset);
  });
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const detail = data.detail;
    const msg = typeof detail === "string" ? detail : JSON.stringify(detail || text);
    throw new Error(msg || res.statusText);
  }
  return data;
}

async function loadGlobalConfig() {
  const cfg = await api("/api/config/llm");
  el("global-model").value = cfg.model || "";
  el("global-api-base").value = cfg.api_base || "";
  el("global-max-tokens").value = cfg.max_tokens || 4096;
  if (el("global-reply-length")) {
    el("global-reply-length").value = cfg.reply_length || "short";
  }
  el("global-api-key").placeholder = cfg.api_key ? "留空不修改" : "请输入 API Key";
}

function initTheme() {
  const data = loadTheme();
  currentPreset = data.preset && PRESETS[data.preset] ? data.preset : "dark";
  if (data.legacy) {
    currentPreset = "dark";
    setColorInputs(null, "dark");
    setFontInputs(DEFAULT_FONT);
    setGlowInputs(DEFAULT_GLOW);
  } else {
    setColorInputs(data.colors, currentPreset);
    setFontInputs(data.font);
    setGlowInputs(data.glow);
  }
  showPresetUI(currentPreset);
  updateThemeSwatches();
}

function openSettingsModal() {
  const overlay = el("settings-overlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("settings-open");
  initTheme();
  loadGlobalConfig();
  el("btn-close-settings")?.focus();
}

function closeSettingsModal() {
  const overlay = el("settings-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("settings-open");
  el("btn-open-settings")?.focus();
}

function bindSettingsModal() {
  const overlay = el("settings-overlay");
  if (!overlay) return;

  el("btn-open-settings")?.addEventListener("click", openSettingsModal);
  el("btn-close-settings")?.addEventListener("click", closeSettingsModal);
  el("settings-backdrop")?.addEventListener("click", closeSettingsModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
      closeSettingsModal();
    }
  });
}

function bindSettingsControls() {
  if (settingsControlsBound) return;
  settingsControlsBound = true;

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.preset;
      showPresetUI(preset);
      setColorInputs(null, preset);
      previewCurrentTheme();
    });
  });

  Object.entries(COLOR_INPUT_IDS).forEach(([key, inputId]) => {
    const input = el(inputId);
    if (!input) return;
    input.addEventListener("input", () => {
      const swatch = el(SWATCH_IDS[key]);
      if (swatch) swatch.style.background = input.value;
      previewCurrentTheme();
    });
  });

  const fontFamily = el("theme-font-family");
  if (fontFamily) {
    fontFamily.addEventListener("change", () => {
      if (fontFamily.value !== "upload") {
        const urlInput = el("theme-font-url");
        const faceInput = el("theme-font-face-name");
        if (urlInput) urlInput.value = "";
        if (faceInput) faceInput.value = "";
        setFontUploadStatus("");
      }
      toggleFontCustomBlock(fontFamily.value === "custom" || fontFamily.value === "upload");
      previewCurrentTheme();
    });
  }
  const fontCustom = el("theme-font-custom");
  if (fontCustom) {
    fontCustom.addEventListener("input", () => previewCurrentTheme());
  }
  const fontSize = el("theme-font-size");
  if (fontSize) {
    fontSize.addEventListener("input", () => {
      const label = el("theme-font-size-val");
      if (label) label.textContent = `${fontSize.value}%`;
      previewCurrentTheme();
    });
  }

  const glowEnabled = el("theme-glow-enabled");
  const glowIntensity = el("theme-glow-intensity");
  if (glowEnabled) {
    glowEnabled.addEventListener("change", () => {
      if (glowIntensity) glowIntensity.disabled = !glowEnabled.checked;
      previewCurrentTheme();
    });
  }
  if (glowIntensity) {
    glowIntensity.addEventListener("input", () => {
      const label = el("theme-glow-intensity-val");
      if (label) label.textContent = `${glowIntensity.value}%`;
      previewCurrentTheme();
    });
  }

  el("btn-save-theme").onclick = () => {
    const colors = readColorInputs();
    const font = readFontInputs();
    const glow = readGlowInputs();
    applyThemeBundle(currentPreset, colors, font, glow);
    saveTheme({ preset: currentPreset, colors, font, glow });
    updateThemeSwatches();
    alert("主题已保存");
  };

  el("btn-reset-theme").onclick = () => {
    const data = resetTheme();
    currentPreset = "dark";
    setColorInputs(data.colors, "dark");
    setFontInputs(data.font);
    setGlowInputs(data.glow);
    showPresetUI("dark");
    alert("已恢复默认暗色主题");
  };

  el("btn-save-global").onclick = async () => {
    const body = {
      model: el("global-model").value,
      api_base: el("global-api-base").value,
      max_tokens: Number(el("global-max-tokens").value) || 4096,
      reply_length: el("global-reply-length")?.value || "short",
    };
    const key = el("global-api-key").value;
    if (key) body.api_key = key;
    await api("/api/config/llm", { method: "PATCH", body: JSON.stringify(body) });
    await loadGlobalConfig();
    alert("API 配置已保存");
  };

  el("btn-test-llm").onclick = async () => {
    const box = el("test-result");
    box.classList.remove("hidden", "ok", "err");
    box.textContent = "测试中…";
    try {
      const data = await api("/api/config/llm/test", { method: "POST" });
      box.classList.add("ok");
      box.textContent = `成功 · ${data.latency_ms}ms · 模型: ${data.model}\n回复: ${data.reply}`;
    } catch (e) {
      box.classList.add("err");
      box.textContent = `失败: ${e.message}`;
    }
  };
}

function initSettings() {
  initTheme();
  bindSettingsControls();
  bindSettingsModal();
  bindFontPickerControls((patch) => {
    if (patch) {
      const urlInput = el("theme-font-url");
      const faceInput = el("theme-font-face-name");
      if (urlInput) urlInput.value = patch.fontUrl || "";
      if (faceInput) faceInput.value = patch.fontFaceName || "";
      if (patch.familyKey && el("theme-font-family")) {
        ensureUploadSelectOption();
        el("theme-font-family").value = patch.familyKey;
      }
      toggleFontCustomBlock(true);
    }
    previewCurrentTheme();
  });

  if (!el("settings-overlay")) {
    loadGlobalConfig();
  }
}

initSettings();
