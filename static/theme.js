/** Theme presets, brightness shifts, fonts, localStorage (key: kryptos-theme) */

const THEME_KEY = "kryptos-theme";

const THEME_PICKER_KEYS = ["--bg", "--panel", "--text", "--accent"];

const THEME_SHIFT_KEYS = ["--bg", "--panel", "--border", "--text", "--accent", "--restricted"];

const CSS_VARS = [
  ...THEME_SHIFT_KEYS,
  "--dialogue-text",
  "--accent-soft",
  "--scrollbar-thumb",
  "--scrollbar-thumb-hover",
  "--scrollbar-track",
  "--glow-text",
  "--glow-text-strong",
  "--glow-box",
  "--glow-box-strong",
];

const SCROLLBAR_DEFAULTS = {
  dark: {
    "--scrollbar-thumb": "#3d465c",
    "--scrollbar-thumb-hover": "#556075",
    "--scrollbar-track": "rgba(15, 17, 23, 0.4)",
  },
  light: {
    "--scrollbar-thumb": "#c5cad6",
    "--scrollbar-thumb-hover": "#a8b0c0",
    "--scrollbar-track": "rgba(244, 245, 247, 0.6)",
  },
};

const PRESETS = {
  dark: {
    name: "暗色",
    vars: {
      "--bg": "#0f1117",
      "--panel": "#1a1d27",
      "--border": "#2a2f3d",
      "--text": "#e8eaef",
      "--accent": "#6c9eff",
      "--restricted": "#e8a54b",
    },
  },
  light: {
    name: "浅色",
    vars: {
      "--bg": "#f4f5f7",
      "--panel": "#ffffff",
      "--border": "#d8dce6",
      "--text": "#1a1d27",
      "--accent": "#3b6fd9",
      "--restricted": "#c47a2c",
    },
  },
};

const FONT_PRESETS = {
  segoe: {
    name: "Segoe UI",
    family: '"Segoe UI", system-ui, sans-serif',
  },
  system: {
    name: "系统默认",
    family: "system-ui, -apple-system, sans-serif",
  },
  yahei: {
    name: "微软雅黑",
    family: '"Microsoft YaHei", "PingFang SC", sans-serif',
  },
  pingfang: {
    name: "苹方",
    family: '"PingFang SC", "Microsoft YaHei", sans-serif',
  },
  serif: {
    name: "衬线",
    family: 'Georgia, "Times New Roman", serif',
  },
  mono: {
    name: "等宽",
    family: 'Consolas, "Cascadia Mono", monospace',
  },
  custom: {
    name: "本机 / 更多",
    family: null,
  },
  upload: {
    name: "已上传字体",
    family: null,
  },
};

const DEFAULT_FONT = {
  familyKey: "segoe",
  sizePercent: 100,
  customFamily: "",
  fontUrl: "",
  fontFaceName: "",
};

const DEFAULT_GLOW = {
  enabled: true,
  intensity: 65,
};

const UPLOADED_FONT_STYLE_ID = "kryptos-uploaded-font-face";

function fontFaceNameFromUrl(url) {
  const base = (url || "").split("/").pop() || "font";
  return `kryptos-font-${base.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function registerWebFont(fontUrl, fontFaceName) {
  if (!fontUrl || !fontFaceName) return;
  let style = document.getElementById(UPLOADED_FONT_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = UPLOADED_FONT_STYLE_ID;
    document.head.appendChild(style);
  }
  const lower = fontUrl.toLowerCase();
  const format = lower.endsWith(".woff2")
    ? "woff2"
    : lower.endsWith(".woff")
      ? "woff"
      : lower.endsWith(".otf")
        ? "opentype"
        : "truetype";
  style.textContent = `@font-face {
  font-family: "${fontFaceName}";
  src: url("${fontUrl}") format("${format}");
  font-display: swap;
}`;
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((n) => clampByte(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

function parseColorToHex(color) {
  if (!color) return null;
  const s = String(color).trim();
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (h.length === 3) {
      return (
        "#" +
        h
          .split("")
          .map((c) => c + c)
          .join("")
      );
    }
    if (h.length >= 6) return "#" + h.slice(0, 6);
    return null;
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]));
}

function shiftColor(color, delta) {
  const hex = parseColorToHex(color);
  if (!hex) return color;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return rgbToHex(r + delta, g + delta, b + delta);
}

function rgbChannelDelta(from, to) {
  const h1 = parseColorToHex(from);
  const h2 = parseColorToHex(to);
  if (!h1 || !h2) return 0;
  const dr = parseInt(h2.slice(1, 3), 16) - parseInt(h1.slice(1, 3), 16);
  const dg = parseInt(h2.slice(3, 5), 16) - parseInt(h1.slice(3, 5), 16);
  const db = parseInt(h2.slice(5, 7), 16) - parseInt(h1.slice(5, 7), 16);
  return Math.round((dr + dg + db) / 3);
}

function accentSoft(accent) {
  const hex = parseColorToHex(accent);
  if (!hex) return "rgba(108, 158, 255, 0.12)";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

function normalizeGlowSettings(glow) {
  if (glow === undefined || glow === null) return { ...DEFAULT_GLOW };
  return {
    enabled: glow.enabled !== false,
    intensity: Math.max(0, Math.min(100, Number(glow.intensity) ?? DEFAULT_GLOW.intensity)),
  };
}

function buildGlowVars(accent, glow) {
  const settings = normalizeGlowSettings(glow);
  const t = settings.enabled ? settings.intensity / 100 : 0;
  const none = {
    "--glow-text": "none",
    "--glow-text-strong": "none",
    "--glow-box": "none",
    "--glow-box-strong": "none",
  };
  if (t <= 0) return none;

  const hex = parseColorToHex(accent);
  if (!hex) return none;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const blur1 = Math.round(8 + 14 * t);
  const blur2 = Math.round(16 + 28 * t);
  const blur3 = Math.round(28 + 44 * t);
  const a1 = (0.35 + 0.35 * t).toFixed(2);
  const a2 = (0.55 + 0.35 * t).toFixed(2);
  const a3 = (0.2 + 0.35 * t).toFixed(2);

  return {
    "--glow-text": `0 0 ${blur1}px rgba(${r}, ${g}, ${b}, ${a1})`,
    "--glow-text-strong": `0 0 ${blur1}px rgba(${r}, ${g}, ${b}, ${a1}), 0 0 ${blur2}px rgba(${r}, ${g}, ${b}, ${a2})`,
    "--glow-box": `0 0 ${blur1}px rgba(${r}, ${g}, ${b}, ${a3}), 0 0 ${blur2}px rgba(${r}, ${g}, ${b}, ${a2})`,
    "--glow-box-strong": `0 0 ${blur2}px rgba(${r}, ${g}, ${b}, ${a2}), 0 0 ${blur3}px rgba(${r}, ${g}, ${b}, ${a1})`,
  };
}

function applyGlowClass(glow) {
  const settings = normalizeGlowSettings(glow);
  document.documentElement.classList.toggle(
    "glow-enabled",
    settings.enabled && settings.intensity > 0
  );
}

function defaultColorsForPreset(preset) {
  const vars = PRESETS[preset]?.vars || PRESETS.dark.vars;
  const colors = {};
  THEME_PICKER_KEYS.forEach((key) => {
    colors[key] = parseColorToHex(vars[key]) || vars[key];
  });
  return colors;
}

function shiftsToColors(preset, shifts) {
  const base = PRESETS[preset]?.vars || PRESETS.dark.vars;
  const shifted = applyShiftsToVars(base, shifts);
  const colors = {};
  THEME_PICKER_KEYS.forEach((key) => {
    colors[key] = parseColorToHex(shifted[key]) || shifted[key];
  });
  return colors;
}

function finalizeThemeVars(vars, preset, glow) {
  const base = PRESETS[preset]?.vars || PRESETS.dark.vars;
  vars["--border"] = shiftColor(vars["--panel"], rgbChannelDelta(base["--panel"], base["--border"]));
  vars["--restricted"] = base["--restricted"];
  if (vars["--accent"]) {
    vars["--dialogue-text"] = shiftColor(vars["--accent"], 18);
    vars["--accent-soft"] = accentSoft(vars["--accent"]);
    Object.assign(vars, buildGlowVars(vars["--accent"], glow));
  } else {
    Object.assign(vars, buildGlowVars("#6c9eff", glow));
  }
  return vars;
}

function emptyShifts() {
  const shifts = {};
  THEME_SHIFT_KEYS.forEach((k) => {
    shifts[k] = 0;
  });
  return shifts;
}

function normalizeFontSettings(font) {
  let familyKey = font?.familyKey;
  const validKeys = new Set(Object.keys(FONT_PRESETS));
  if (!validKeys.has(familyKey)) {
    familyKey = DEFAULT_FONT.familyKey;
  }
  const sizePercent = Math.max(85, Math.min(125, Number(font?.sizePercent) || DEFAULT_FONT.sizePercent));
  const customFamily = typeof font?.customFamily === "string" ? font.customFamily : "";
  const fontUrl = typeof font?.fontUrl === "string" ? font.fontUrl : "";
  let fontFaceName = typeof font?.fontFaceName === "string" ? font.fontFaceName : "";
  if (familyKey === "upload" && fontUrl && !fontFaceName) {
    fontFaceName = fontFaceNameFromUrl(fontUrl);
  }
  if (familyKey !== "upload") {
    return { familyKey, sizePercent, customFamily, fontUrl: "", fontFaceName: "" };
  }
  return { familyKey, sizePercent, customFamily, fontUrl, fontFaceName };
}

function resolveFontFamily(font) {
  const normalized = normalizeFontSettings(font);
  if (normalized.familyKey === "upload" && normalized.fontFaceName) {
    return `"${normalized.fontFaceName}", sans-serif`;
  }
  if (normalized.familyKey === "custom") {
    const trimmed = normalized.customFamily.trim();
    if (!trimmed) return FONT_PRESETS.segoe.family;
    if (trimmed.includes(",") || /^["']/.test(trimmed)) return trimmed;
    return `"${trimmed.replace(/"/g, "")}", sans-serif`;
  }
  return FONT_PRESETS[normalized.familyKey].family;
}

function applyFontSettings(font) {
  const normalized = normalizeFontSettings(font);
  if (normalized.familyKey === "upload" && normalized.fontUrl) {
    registerWebFont(normalized.fontUrl, normalized.fontFaceName);
  }
  const root = document.documentElement;
  root.style.setProperty("--font-family", resolveFontFamily(normalized));
  root.style.fontSize = `${(16 * normalized.sizePercent) / 100}px`;
  return normalized;
}

function applyShiftsToVars(baseVars, shifts = {}) {
  const result = { ...baseVars };
  THEME_SHIFT_KEYS.forEach((key) => {
    const delta = Number(shifts[key]) || 0;
    if (delta && result[key]) {
      result[key] = shiftColor(result[key], delta);
    }
  });
  return result;
}

function applyTheme(vars) {
  const root = document.documentElement;
  CSS_VARS.forEach((key) => {
    if (vars[key] !== undefined) root.style.setProperty(key, vars[key]);
  });
}

function applyThemeBundle(preset, colors, font, glow) {
  const normalizedGlow = normalizeGlowSettings(glow);
  const vars = buildTheme(preset, colors, null, normalizedGlow);
  applyTheme(vars);
  applyScrollbarPreset(preset);
  applyFontSettings(font || DEFAULT_FONT);
  applyGlowClass(normalizedGlow);
  return { vars, glow: normalizedGlow };
}

function applyScrollbarPreset(presetName) {
  const scrollbar = SCROLLBAR_DEFAULTS[presetName] || SCROLLBAR_DEFAULTS.dark;
  const root = document.documentElement;
  Object.entries(scrollbar).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

function buildTheme(preset, colors, legacyVars, glow) {
  if (legacyVars && !colors) {
    return finalizeThemeVars({ ...legacyVars }, preset, glow);
  }
  const base = PRESETS[preset]?.vars || PRESETS.dark.vars;
  const vars = { ...base };
  if (colors && typeof colors === "object") {
    THEME_PICKER_KEYS.forEach((key) => {
      const hex = parseColorToHex(colors[key]);
      if (hex) vars[key] = hex;
    });
  }
  return finalizeThemeVars(vars, preset, glow);
}

function saveTheme(data) {
  localStorage.setItem(THEME_KEY, JSON.stringify(data));
}

function loadTheme() {
  const raw = localStorage.getItem(THEME_KEY);
  if (!raw) {
    const colors = defaultColorsForPreset("dark");
    const glow = { ...DEFAULT_GLOW };
    const { vars } = applyThemeBundle("dark", colors, DEFAULT_FONT, glow);
    const font = applyFontSettings(DEFAULT_FONT);
    return { preset: "dark", colors, font, glow, vars };
  }
  try {
    const data = JSON.parse(raw);
    const preset = data.preset || "dark";
    let colors = data.colors;
    if (!colors && data.shifts) {
      colors = shiftsToColors(preset, data.shifts);
    }
    if (!colors) {
      colors = defaultColorsForPreset(preset);
    }
    const glow = normalizeGlowSettings(data.glow);
    const legacy = data.vars && !data.shifts && !data.colors;
    const vars = legacy
      ? buildTheme(preset, null, data.vars, glow)
      : buildTheme(preset, colors, null, glow);
    applyTheme(vars);
    applyScrollbarPreset(preset);
    const font = applyFontSettings(data.font || DEFAULT_FONT);
    applyGlowClass(glow);
    return { preset, colors, font, glow, vars, legacy };
  } catch {
    const colors = defaultColorsForPreset("dark");
    const glow = { ...DEFAULT_GLOW };
    const { vars } = applyThemeBundle("dark", colors, DEFAULT_FONT, glow);
    const font = applyFontSettings(DEFAULT_FONT);
    return { preset: "dark", colors, font, glow, vars };
  }
}

function resetTheme() {
  localStorage.removeItem(THEME_KEY);
  const colors = defaultColorsForPreset("dark");
  const glow = { ...DEFAULT_GLOW };
  const { vars } = applyThemeBundle("dark", colors, DEFAULT_FONT, glow);
  const font = applyFontSettings(DEFAULT_FONT);
  return { preset: "dark", colors, font, glow, vars };
}

if (typeof window !== "undefined") {
  loadTheme();
}
