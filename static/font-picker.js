/** System font enumeration + font file upload for theme settings */

let cachedSystemFamilies = [];

function canQueryLocalFonts() {
  return typeof window.queryLocalFonts === "function";
}

function populateFontDatalist(families) {
  const list = document.getElementById("theme-font-datalist");
  if (!list) return;
  list.innerHTML = families
    .map((family) => `<option value="${escapeAttr(family)}"></option>`)
    .join("");
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

async function loadSystemFonts() {
  if (!canQueryLocalFonts()) {
    throw new Error("当前浏览器不支持读取本机字体（请用 Chrome / Edge，或改为上传字体文件）");
  }
  const fonts = await window.queryLocalFonts();
  const seen = new Set();
  const families = [];
  for (const f of fonts) {
    const family = (f.family || "").trim();
    if (!family || seen.has(family)) continue;
    seen.add(family);
    families.push(family);
  }
  families.sort((a, b) => a.localeCompare(b, "zh-CN"));
  cachedSystemFamilies = families;
  populateFontDatalist(families);
  return families;
}

async function uploadFontFile(file) {
  if (!file) return null;
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("字体文件不能超过 10MB");
  }
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/assets/font", { method: "POST", body: formData });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.detail || text;
    } catch {
      /* keep text */
    }
    throw new Error(msg || res.statusText);
  }
  return await res.json();
}

function setFontUploadStatus(text) {
  const node = document.getElementById("theme-font-upload-status");
  if (node) node.textContent = text || "";
}

function ensureUploadSelectOption() {
  const sel = document.getElementById("theme-font-family");
  if (!sel || sel.querySelector('option[value="upload"]')) return;
  const opt = document.createElement("option");
  opt.value = "upload";
  opt.textContent = "已上传字体";
  sel.appendChild(opt);
}

function bindFontPickerControls(onChange) {
  const loadBtn = document.getElementById("btn-load-system-fonts");
  const uploadBtn = document.getElementById("btn-upload-font");
  const fileInput = document.getElementById("theme-font-file");
  const customInput = document.getElementById("theme-font-custom");
  const familySel = document.getElementById("theme-font-family");

  if (loadBtn) {
    loadBtn.disabled = !canQueryLocalFonts();
    loadBtn.title = canQueryLocalFonts()
      ? "读取本机已安装字体（需授权）"
      : "当前浏览器不支持，请上传字体文件";
    loadBtn.addEventListener("click", async () => {
      loadBtn.disabled = true;
      setFontUploadStatus("读取中…");
      try {
        const families = await loadSystemFonts();
        setFontUploadStatus(`已加载 ${families.length} 个字体，可在下方搜索选择`);
        if (customInput) customInput.focus();
      } catch (err) {
        setFontUploadStatus("");
        alert(err.message || String(err));
      } finally {
        loadBtn.disabled = !canQueryLocalFonts();
      }
    });
  }

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      fileInput.value = "";
      if (!file) return;
      uploadBtn.disabled = true;
      setFontUploadStatus("上传中…");
      try {
        const data = await uploadFontFile(file);
        const fontFaceName = fontFaceNameFromUrl(data.url);
        registerWebFont(data.url, fontFaceName);
        ensureUploadSelectOption();
        if (familySel) familySel.value = "upload";
        if (customInput) customInput.value = file.name.replace(/\.[^.]+$/, "");
        onChange?.({
          familyKey: "upload",
          fontUrl: data.url,
          fontFaceName,
          customFamily: "",
        });
        setFontUploadStatus(`已上传：${file.name}`);
      } catch (err) {
        setFontUploadStatus("");
        alert("上传失败: " + (err.message || String(err)));
      } finally {
        uploadBtn.disabled = false;
      }
    });
  }

  if (customInput) {
    customInput.addEventListener("input", () => {
      if (familySel && familySel.value === "upload") return;
      onChange?.();
    });
    customInput.addEventListener("change", () => {
      if (familySel && familySel.value !== "upload" && familySel.value !== "custom") {
        familySel.value = "custom";
        onChange?.();
      }
    });
  }
}
