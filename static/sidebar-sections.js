/** Collapsible sidebar modules + persisted expand state. */

const SIDEBAR_SECTIONS_STORAGE = "kryptos-sidebar-sections";

function loadSidebarSectionStates() {
  try {
    const raw = localStorage.getItem(SIDEBAR_SECTIONS_STORAGE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSidebarSectionStates(states) {
  try {
    localStorage.setItem(SIDEBAR_SECTIONS_STORAGE, JSON.stringify(states));
  } catch {
    /* ignore */
  }
}

function setSidebarSectionExpanded(section, expanded, persist = true) {
  if (!section) return;
  const toggle = section.querySelector(".sidebar-section-toggle");
  const body = section.querySelector(".sidebar-section-body");
  if (!toggle || !body) return;

  section.classList.toggle("sidebar-section--collapsed", !expanded);
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  body.classList.toggle("hidden", !expanded);

  if (persist && section.id) {
    const states = loadSidebarSectionStates();
    states[section.id] = expanded;
    saveSidebarSectionStates(states);
  }
}

function expandSidebarSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  setSidebarSectionExpanded(section, true, false);
  const states = loadSidebarSectionStates();
  states[sectionId] = true;
  saveSidebarSectionStates(states);
}

function setupSidebarSections() {
  const panels = document.querySelectorAll(".panel.left, .panel.right");
  const saved = loadSidebarSectionStates();

  panels.forEach((panel) => {
    panel.querySelectorAll(".sidebar-section").forEach((section) => {
      const toggle = section.querySelector(".sidebar-section-toggle");
      const body = section.querySelector(".sidebar-section-body");
      if (!toggle || !body) return;

      const id = section.id;
      const expanded = id && saved[id] !== undefined ? saved[id] : true;
      setSidebarSectionExpanded(section, expanded, false);

      if (toggle.dataset.bound) return;
      toggle.dataset.bound = "1";
      toggle.addEventListener("click", () => {
        const isOpen = toggle.getAttribute("aria-expanded") === "true";
        setSidebarSectionExpanded(section, !isOpen);
      });
    });
  });
}
