let profiles = [],
  activeId = null,
  isDirty = false;
let _savedSnapshot = null;
let previewOpen = false,
  previewTimer = null;
let _deleteSectionId = null,
  _deleteSectionEl = null;
let _nextSectionId = 1;

// ── Settings & download dir ───────────────────────────────
// Stored in localStorage:
//   rg_theme       — 'dark' | 'light'
//   rg_always_ask  — '1' = always open picker
//   rg_dir_name    — display name of saved dir (e.g. "Downloads")
// The actual FileSystemDirectoryHandle is stored in IndexedDB via helpers below.

const supportsFilePicker = !!window.showSaveFilePicker;

// IndexedDB helpers to persist the directory handle
function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open("rg_db", 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore("kv");
    req.onsuccess = (e) => res(e.target.result);
    req.onerror = (e) => rej(e.target.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = (e) => rej(e.target.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(val, key);
    tx.oncomplete = res;
    tx.onerror = (e) => rej(e.target.error);
  });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = res;
    tx.onerror = (e) => rej(e.target.error);
  });
}

// ── Pending dir handle (to show confirm modal after first save) ──
let _pendingDirHandle = null;

// ── Init ─────────────────────────────────────────────────────
const savedTheme = localStorage.getItem("rg_theme") || "dark";
applyTheme(savedTheme);
loadSettings();

fetch("/api/profiles")
  .then((r) => r.json())
  .then((data) => {
    profiles = data;
    renderSidebar();
    if (profiles.length > 0) selectProfile(profiles[0].id);
  });

// ── Theme ────────────────────────────────────────────────────
function toggleTheme() {
  const next =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "light"
      : "dark";
  applyTheme(next);
  localStorage.setItem("rg_theme", next);
}
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  document.getElementById("theme-label").textContent =
    t === "dark" ? "🌙 Escuro" : "☀ Claro";
  document.getElementById("theme-checkbox").checked = t === "dark";
}

// ── Preview ───────────────────────────────────────────────────
function togglePreview() {
  previewOpen = !previewOpen;
  document
    .getElementById("preview-panel")
    .classList.toggle("open", previewOpen);
  document
    .getElementById("btn-preview")
    .classList.toggle("active", previewOpen);
  if (previewOpen) renderPreview();
}

// ── Sidebar ───────────────────────────────────────────────────
function renderSidebar() {
  const el = document.getElementById("profile-list");
  if (!profiles.length) {
    el.innerHTML = `<div style="padding:12px 10px;font-size:12px;color:var(--text3)">Nenhum perfil ainda</div>`;
    return;
  }
  el.innerHTML = profiles
    .map(
      (p) => `
    <div class="profile-card ${p.id === activeId ? "active" : ""}" onclick="selectProfile('${p.id}')">
      <div class="profile-card-label">${esc(p.label || p.name || "Sem nome")}</div>
      <div class="profile-card-meta">${esc(p.name || "")}${p.version ? " · " + p.version : ""}</div>
    </div>`,
    )
    .join("");
}

function selectProfile(id) {
  activeId = id;
  renderSidebar();
  loadEditor(profiles.find((x) => x.id === id));
  document.getElementById("topbar-actions").style.display = "flex";
  setDirty(false);
}
function newProfile() {
  activeId = null;
  renderSidebar();
  loadEditor({
    label: "",
    version: "",
    name: "",
    location: "",
    phone: "",
    email: "",
    linkedin_label: "LinkedIn",
    linkedin_url: "",
    github_label: "GitHub",
    github_url: "",
    resumo: "",
    experience: [],
    technologies: [],
    education: [],
    skills: [],
    languages: [],
    custom_sections: [],
    theme_accent: "#1B3A6B",
    theme_body: "#111111",
    theme_muted: "#555555",
    show_badge: false,
  });
  document.getElementById("topbar-actions").style.display = "flex";
  setDirty(false);
}

function setDirty(v) {
  isDirty = v;
  document.getElementById("unsaved-dot").classList.toggle("show", v);
  const btn = document.getElementById("btn-save");
  if (btn) {
    btn.disabled = !v;
  }
}
function checkDirty() {
  if (!_savedSnapshot) return;
  setDirty(JSON.stringify(collectProfile()) !== _savedSnapshot);
}
document.addEventListener("input", (e) => {
  if (e.target.closest("#editor")) {
    checkDirty();
    schedulePreview();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.closest("#editor")) {
    checkDirty();
    schedulePreview();
  }
});

// ── Load editor ───────────────────────────────────────────────
function loadEditor(p) {
  document.getElementById("empty-state").style.display = "none";
  document.getElementById("editor").style.display = "block";
  document.getElementById("topbar-title").textContent =
    p.label || p.name || "Novo Perfil";
  V("f-label", p.label);
  V("f-version", p.version);
  V("f-name", p.name);
  V("f-location", p.location);
  V("f-phone", p.phone);
  V("f-email", p.email);
  V("f-linkedin-label", p.linkedin_label || "LinkedIn");
  V("f-linkedin-url", p.linkedin_url);
  V("f-github-label", p.github_label || "GitHub");
  V("f-github-url", p.github_url);
  V("f-resumo", p.resumo);
  V("f-accent", p.theme_accent || "#1B3A6B");
  document.getElementById("f-accent-picker").value =
    p.theme_accent || "#1B3A6B";
  V("f-body", p.theme_body || "#111111");
  document.getElementById("f-body-picker").value = p.theme_body || "#111111";
  V("f-muted", p.theme_muted || "#555555");
  document.getElementById("f-muted-picker").value = p.theme_muted || "#555555";
  document.getElementById("f-badge").checked = p.show_badge === true;
  clearAllErrors();
  document.getElementById("exp-list").innerHTML = "";
  (p.experience || []).forEach(addExperience);
  document.getElementById("edu-list").innerHTML = "";
  (p.education || []).forEach(addEducation);
  renderSimpleList("tech-list", p.technologies || []);
  renderSimpleList("skills-list", p.skills || []);
  renderSimpleList("lang-list", p.languages || []);
  updateCount("exp-count", (p.experience || []).length);
  updateCount("edu-count", (p.education || []).length);
  document.getElementById("custom-sections-container").innerHTML = "";
  (p.custom_sections || []).forEach((cs) => renderCustomSection(cs));
  if (previewOpen) renderPreview();
  setTimeout(() => {
    _savedSnapshot = JSON.stringify(collectProfile());
  }, 0);
}
function V(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || "";
}
function G(id) {
  return (document.getElementById(id)?.value || "").trim();
}

// ── Experience ────────────────────────────────────────────────
function addExperience(data = {}) {
  const el = document.createElement("div");
  el.className = "repeat-item";
  const idx = document.querySelectorAll("#exp-list .repeat-item").length + 1;
  el.innerHTML = `
    <div class="repeat-item-header">
      <span class="repeat-item-num">Exp ${idx}</span>
      <button class="btn-remove-item" onclick="removeRepeat(this,'exp-list','exp-count')">✕ remover</button>
    </div>
    <div class="grid grid-2">
      <div class="field"><label class="field-label">Cargo</label>
        <input class="exp-title" type="text" value="${ea(data.title)}" placeholder="Dev Front-end"></div>
      <div class="field"><label class="field-label">Empresa</label>
        <input class="exp-company" type="text" value="${ea(data.company)}" placeholder="ACME"></div>
      <div class="field"><label class="field-label">Localização</label>
        <input class="exp-location" type="text" value="${ea(data.location)}" placeholder="São Paulo, SP"></div>
      <div class="field"><label class="field-label">Início (MM/AAAA)</label>
        <input class="exp-start" type="text" value="${ea(data.start_date)}" placeholder="08/2024"></div>
      <div class="field col-span-2"><label class="field-label">Fim (vazio = atual)</label>
        <input class="exp-end" type="text" value="${ea(data.end_date)}" placeholder="01/2024"></div>
      <div class="field col-span-2"><label class="field-label">Bullet points</label>
        <div class="bullet-list" data-bullets></div>
        <button class="btn-add-item" style="margin-top:4px" onclick="addBullet(this)">+ Adicionar bullet</button>
      </div>
    </div>`;
  document.getElementById("exp-list").appendChild(el);
  const bl = el.querySelector("[data-bullets]");
  (data.bullets || []).forEach((b) => addBulletTo(bl, b));
  if (!(data.bullets || []).length) addBulletTo(bl, "");
  updateCount(
    "exp-count",
    document.querySelectorAll("#exp-list .repeat-item").length,
  );
}
function addBullet(btn) {
  addBulletTo(btn.previousElementSibling, "");
}
function addBulletTo(list, v) {
  const r = document.createElement("div");
  r.className = "bullet-row";
  r.innerHTML = `<input type="text" value="${ea(v)}" placeholder="O que você fez e qual foi o impacto...">
    <button class="btn-rm-bullet" onclick="this.parentElement.remove()">✕</button>`;
  list.appendChild(r);
}

// ── Education ─────────────────────────────────────────────────
function addEducation(data = {}) {
  const el = document.createElement("div");
  el.className = "repeat-item";
  const idx = document.querySelectorAll("#edu-list .repeat-item").length + 1;
  el.innerHTML = `
    <div class="repeat-item-header">
      <span class="repeat-item-num">Edu ${idx}</span>
      <button class="btn-remove-item" onclick="removeRepeat(this,'edu-list','edu-count')">✕ remover</button>
    </div>
    <div class="grid grid-2">
      <div class="field"><label class="field-label">Período</label>
        <input class="edu-dates" type="text" value="${ea(data.dates)}" placeholder="07/2023 - 07/2027"></div>
      <div class="field"><label class="field-label">Status</label>
        <select class="edu-status">
          <option ${data.status === "Cursando" ? "selected" : ""}>Cursando</option>
          <option ${data.status === "Concluído" ? "selected" : ""}>Concluído</option>
          <option ${data.status === "Trancado" ? "selected" : ""}>Trancado</option>
        </select></div>
      <div class="field col-span-2"><label class="field-label">Grau e curso</label>
        <input class="edu-degree" type="text" value="${ea(data.degree)}" placeholder="Bacharelado em Eng. de Software"></div>
      <div class="field col-span-2"><label class="field-label">Instituição · Cidade</label>
        <input class="edu-institution" type="text" value="${ea(data.institution)}" placeholder="FIAP · São Paulo"></div>
    </div>`;
  document.getElementById("edu-list").appendChild(el);
  updateCount(
    "edu-count",
    document.querySelectorAll("#edu-list .repeat-item").length,
  );
}

function removeRepeat(btn, listId, countId) {
  btn.closest(".repeat-item").remove();
  updateCount(
    countId,
    document.querySelectorAll(`#${listId} .repeat-item`).length,
  );
}

// ── Simple lists ──────────────────────────────────────────────
function renderSimpleList(id, items) {
  document.getElementById(id).innerHTML = "";
  items.forEach((v) => addSimple(id, v));
}
function addSimple(id, v = "") {
  const r = document.createElement("div");
  r.className = "simple-row";
  r.innerHTML = `<input type="text" value="${ea(v)}" placeholder="...">
    <button class="btn-rm-bullet" onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById(id).appendChild(r);
}
function getSimpleList(id) {
  return [...document.querySelectorAll(`#${id} input`)]
    .map((i) => i.value.trim())
    .filter(Boolean);
}

// ── Custom sections ───────────────────────────────────────────
function openAddSectionModal() {
  document.getElementById("new-section-name").value = "";
  openModal("modal-add-section");
  setTimeout(() => document.getElementById("new-section-name").focus(), 80);
}

function confirmAddSection(allProfiles) {
  const name = document.getElementById("new-section-name").value.trim();
  if (!name) {
    document.getElementById("new-section-name").focus();
    return;
  }
  closeModal("modal-add-section");
  const section = { id: "cs_" + _nextSectionId++, name, items: [] };
  renderCustomSection(section);
  if (allProfiles) {
    profiles.forEach((p) => {
      if (p.id !== activeId) {
        if (!p.custom_sections) p.custom_sections = [];
        p.custom_sections.push({ ...section, items: [] });
      }
    });
    toast(`"${name}" adicionada a todos os CVs`, "success");
  } else {
    toast(`"${name}" adicionada`, "success");
  }
  setDirty(true);
}

function renderCustomSection(cs) {
  const container = document.getElementById("custom-sections-container");
  const el = document.createElement("div");
  el.className = "section-card";
  el.dataset.csId = cs.id;
  const listId = `cs-list-${cs.id}`;
  el.innerHTML = `
    <div class="section-header" onclick="toggleSection(this)">
      <div class="section-header-left">
        <div class="section-icon">✦</div>
        <span class="section-title">${esc(cs.name)}</span>
        <span class="section-custom-badge">personalizada</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn-section-delete" onclick="event.stopPropagation();openDeleteSectionModal('${cs.id}',this.closest('.section-card'),'${esc(cs.name)}')" title="Excluir seção">✕</button>
        <div class="chevron open"></div>
      </div>
    </div>
    <div class="section-body open">
      <div class="simple-list" id="${listId}"></div>
      <button class="btn-add-item" onclick="addSimple('${listId}','')">+ Adicionar item</button>
    </div>`;
  container.appendChild(el);
  (cs.items || []).forEach((v) => addSimple(listId, v));
}

function openDeleteSectionModal(sectionId, el, name) {
  _deleteSectionId = sectionId;
  _deleteSectionEl = el;
  document.getElementById("modal-delete-section-name").textContent =
    `"${name}"`;
  openModal("modal-delete-section");
}

function confirmDeleteSection(allProfiles) {
  closeModal("modal-delete-section");
  if (_deleteSectionEl) _deleteSectionEl.remove();
  if (allProfiles) {
    profiles.forEach((p) => {
      if (p.custom_sections)
        p.custom_sections = p.custom_sections.filter(
          (cs) => cs.id !== _deleteSectionId,
        );
    });
    toast("Seção removida de todos os CVs", "info");
  } else {
    toast("Seção removida deste CV", "info");
  }
  _deleteSectionId = null;
  _deleteSectionEl = null;
  checkDirty();
}

// ── Collect ───────────────────────────────────────────────────
function collectProfile() {
  const experience = [
    ...document.querySelectorAll("#exp-list .repeat-item"),
  ].map((el) => ({
    title: el.querySelector(".exp-title").value.trim(),
    company: el.querySelector(".exp-company").value.trim(),
    location: el.querySelector(".exp-location").value.trim(),
    start_date: el.querySelector(".exp-start").value.trim(),
    end_date: el.querySelector(".exp-end").value.trim() || null,
    bullets: [...el.querySelectorAll("[data-bullets] input")]
      .map((i) => i.value.trim())
      .filter(Boolean),
  }));
  const education = [
    ...document.querySelectorAll("#edu-list .repeat-item"),
  ].map((el) => ({
    dates: el.querySelector(".edu-dates").value.trim(),
    degree: el.querySelector(".edu-degree").value.trim(),
    institution: el.querySelector(".edu-institution").value.trim(),
    status: el.querySelector(".edu-status").value,
  }));
  const custom_sections = [
    ...document.querySelectorAll("#custom-sections-container .section-card"),
  ].map((el) => ({
    id: el.dataset.csId,
    name: el.querySelector(".section-title").textContent.trim(),
    items: [...el.querySelectorAll(".simple-list input")]
      .map((i) => i.value.trim())
      .filter(Boolean),
  }));
  return {
    id: activeId,
    label: G("f-label"),
    version: G("f-version"),
    name: G("f-name"),
    location: G("f-location"),
    phone: G("f-phone"),
    email: G("f-email"),
    linkedin_label: G("f-linkedin-label"),
    linkedin_url: G("f-linkedin-url"),
    github_label: G("f-github-label"),
    github_url: G("f-github-url"),
    resumo: G("f-resumo"),
    experience,
    education,
    technologies: getSimpleList("tech-list"),
    skills: getSimpleList("skills-list"),
    languages: getSimpleList("lang-list"),
    custom_sections,
    theme_accent: G("f-accent"),
    theme_body: G("f-body"),
    theme_muted: G("f-muted"),
    show_badge: document.getElementById("f-badge").checked,
  };
}

// ── Validate ──────────────────────────────────────────────────
function validate() {
  clearAllErrors();
  let valid = true;
  [
    { id: "f-label", err: "err-label", card: "sc-identity" },
    { id: "f-name", err: "err-name", card: "sc-personal" },
    { id: "f-location", err: "err-location", card: "sc-personal" },
    { id: "f-phone", err: "err-phone", card: "sc-personal" },
    { id: "f-email", err: "err-email", card: "sc-personal" },
    { id: "f-resumo", err: "err-resumo", card: "sc-resumo" },
  ].forEach(({ id, err, card }) => {
    const input = document.getElementById(id),
      val = input.value.trim();
    let msg = "";
    if (!val) msg = "Campo obrigatório";
    else if (id === "f-email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))
      msg = "E-mail inválido";
    if (msg) {
      input.classList.add("error");
      const e = document.getElementById(err);
      e.textContent = msg;
      e.classList.add("show");
      const c = document.getElementById(card);
      c.classList.add("has-error");
      c.querySelector(".section-error-badge").style.display = "inline";
      c.querySelector(".section-body").classList.add("open");
      c.querySelector(".chevron").classList.add("open");
      valid = false;
    }
  });
  return valid;
}
function clearAllErrors() {
  document
    .querySelectorAll(".field input,.field textarea")
    .forEach((e) => e.classList.remove("error"));
  document.querySelectorAll(".field-error").forEach((e) => {
    e.classList.remove("show");
    e.textContent = "";
  });
  document
    .querySelectorAll(".section-error-badge")
    .forEach((e) => (e.style.display = "none"));
  document
    .querySelectorAll(".section-card")
    .forEach((e) => e.classList.remove("has-error"));
}
document.addEventListener("input", (e) => {
  if (e.target.matches(".field input,.field textarea")) {
    e.target.classList.remove("error");
    e.target
      .closest(".field")
      ?.querySelector(".field-error")
      ?.classList.remove("show");
  }
});

// ── Save / Delete ─────────────────────────────────────────────
function saveProfile() {
  if (!validate()) {
    toast("Corrija os campos obrigatórios", "error");
    return;
  }
  const profile = collectProfile();
  fetch("/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  })
    .then((r) => r.json())
    .then((res) => {
      activeId = res.id;
      return fetch("/api/profiles").then((r) => r.json());
    })
    .then((data) => {
      profiles = data;
      renderSidebar();
      document.getElementById("topbar-title").textContent =
        collectProfile().label || "Sem nome";
      _savedSnapshot = JSON.stringify(collectProfile());
      setDirty(false);
      toast("Perfil salvo!", "success");
    });
}
function deleteProfile() {
  if (!confirm("Excluir este perfil permanentemente?")) return;
  if (!activeId) {
    resetToEmpty();
    return;
  }
  fetch(`/api/profiles/${activeId}`, { method: "DELETE" })
    .then(() => fetch("/api/profiles").then((r) => r.json()))
    .then((data) => {
      profiles = data;
      activeId = null;
      renderSidebar();
      resetToEmpty();
      toast("Perfil excluído");
    });
}
function resetToEmpty() {
  document.getElementById("editor").style.display = "none";
  document.getElementById("empty-state").style.display = "flex";
  document.getElementById("topbar-actions").style.display = "none";
  document.getElementById("topbar-title").textContent = "Resume Generator";
  setDirty(false);
}

// ── Progress helpers ──────────────────────────────────────────
let _progressTimer = null;
function showProgress(pct, label) {
  document.getElementById("progress-wrap").style.display = "flex";
  const fill = document.getElementById("progress-bar-fill");
  fill.style.width = pct + "%";
  fill.style.transition =
    pct === 0 ? "none" : "width 0.4s cubic-bezier(.4,0,.2,1)";
  document.getElementById("progress-label").textContent = label;
}
function hideProgress() {
  clearTimeout(_progressTimer);
  const wrap = document.getElementById("progress-wrap");
  wrap.classList.add("done");
  _progressTimer = setTimeout(() => {
    wrap.style.display = "none";
    wrap.classList.remove("done");
  }, 600);
}

// ── Settings ──────────────────────────────────────────────────
function openSettings() {
  loadSettingsUI();
  openModal("modal-settings");
}

function loadSettings() {
  const alwaysAsk = localStorage.getItem("rg_always_ask") === "1";
  const dirName = localStorage.getItem("rg_dir_name") || "";
  const el = document.getElementById("f-always-ask");
  if (el) el.checked = alwaysAsk;
  if (!supportsFilePicker) {
    document.getElementById("settings-no-support").style.display = "flex";
    document.getElementById("settings-ask-row").style.display = "none";
  }
  updateDirHint(dirName);
}
function loadSettingsUI() {
  const dirName = localStorage.getItem("rg_dir_name") || "";
  updateDirHint(dirName);
  document.getElementById("f-always-ask").checked =
    localStorage.getItem("rg_always_ask") === "1";
}
function saveSettings() {
  localStorage.setItem(
    "rg_always_ask",
    document.getElementById("f-always-ask").checked ? "1" : "0",
  );
}
function updateDirHint(name) {
  const hint = document.getElementById("settings-dir-hint");
  const clearBtn = document.getElementById("btn-clear-dir");
  if (!hint) return;
  if (name) {
    hint.textContent = name;
    hint.style.color = "var(--accent)";
    if (clearBtn) clearBtn.style.display = "inline-flex";
  } else {
    hint.textContent = "Nenhuma pasta salva";
    hint.style.color = "";
    if (clearBtn) clearBtn.style.display = "none";
  }
}
async function changeDownloadDir() {
  if (!supportsFilePicker) return;
  try {
    // showDirectoryPicker not available everywhere; use showSaveFilePicker as proxy
    // Actually use showDirectoryPicker if available
    if (!window.showDirectoryPicker) {
      toast("Seu browser não suporta seleção de pasta diretamente", "info");
      return;
    }
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await idbSet("rg_dir_handle", handle);
    localStorage.setItem("rg_dir_name", handle.name);
    updateDirHint(handle.name);
    toast(`Pasta "${handle.name}" salva`, "success");
  } catch (err) {
    if (err.name !== "AbortError")
      toast("Erro ao selecionar pasta: " + err.message, "error");
  }
}
async function clearDownloadDir() {
  await idbDel("rg_dir_handle");
  localStorage.removeItem("rg_dir_name");
  updateDirHint("");
  toast("Pasta removida", "info");
}
// Called when user clicks "Sim, salvar pasta" in the confirm modal
async function confirmSaveDir() {
  closeModal("modal-save-dir");
  if (_pendingDirHandle) {
    await idbSet("rg_dir_handle", _pendingDirHandle);
    localStorage.setItem("rg_dir_name", _pendingDirHandle.name);
    updateDirHint(_pendingDirHandle.name);
    toast(
      `Pasta "${_pendingDirHandle.name}" salva para próximos downloads`,
      "success",
    );
    _pendingDirHandle = null;
  }
}

// ── Generate PDF ──────────────────────────────────────────────
async function generate() {
  if (!validate()) {
    toast("Corrija os campos obrigatórios antes de gerar", "error");
    return;
  }
  const profile = collectProfile();
  const show_badge = document.getElementById("f-badge").checked;
  const btn = document.getElementById("btn-generate");
  const namePart = (profile.name || "resume").replace(/\s+/g, "_");
  const filename = `${namePart}_${profile.version || "cv"}.pdf`;

  btn.disabled = true;
  btn.textContent = "Gerando...";
  showProgress(0, "Preparando...");
  await new Promise((r) => setTimeout(r, 60));
  showProgress(20, "Preparando...");

  try {
    showProgress(45, "Gerando PDF...");
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, show_badge }),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || "Erro ao gerar");
    }

    showProgress(80, "Transferindo...");
    const blob = await res.blob();
    showProgress(100, "Salvando...");
    await new Promise((r) => setTimeout(r, 150));

    await saveBlob(blob, filename);

    hideProgress();
    btn.disabled = false;
    btn.textContent = "⬇ Gerar PDF";
    toast("PDF gerado!", "success");
  } catch (err) {
    showProgress(0, "");
    hideProgress();
    btn.disabled = false;
    btn.textContent = "⬇ Gerar PDF";
    if (err.name !== "AbortError") toast("Erro: " + err.message, "error");
  }
}

// ── Save blob with smart dir logic ────────────────────────────
async function saveBlob(blob, filename) {
  if (!supportsFilePicker) {
    // browser sem suporte — download direto
    triggerDownload(blob, filename);
    return;
  }

  const alwaysAsk = localStorage.getItem("rg_always_ask") === "1";
  const savedDir = await idbGet("rg_dir_handle").catch(() => null);

  if (!alwaysAsk && savedDir) {
    // Temos pasta salva — salvar direto nela
    try {
      await savedDir.requestPermission({ mode: "readwrite" });
      const fileHandle = await savedDir.getFileHandle(filename, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // Pasta pode ter sido removida ou permissão negada — cai no picker
      await idbDel("rg_dir_handle");
      localStorage.removeItem("rg_dir_name");
      updateDirHint("");
    }
  }

  // Sem pasta salva (ou alwaysAsk) — abre picker de arquivo
  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
    });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    // Primeira vez sem pasta salva? Oferece salvar a pasta
    if (!savedDir && !alwaysAsk && !localStorage.getItem("rg_dir_name")) {
      // Obtém o diretório pai via FileSystem API não exposta diretamente,
      // então usa showDirectoryPicker como alternativa no modal
      _pendingDirHandle = null; // reset (usaremos o modal de confirmação diferente)
      // Mostra modal perguntando se quer definir pasta padrão
      openModal("modal-save-dir");
      // O nome da pasta sugerida vem do próprio nome do arquivo salvo
      document.getElementById("modal-dir-name").textContent =
        "uma pasta padrão";
    }
  } catch (err) {
    if (err.name === "AbortError") return; // cancelou — ok
    throw err;
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Preview render ────────────────────────────────────────────
function schedulePreview() {
  if (!previewOpen) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 300);
}
function calcDuration(start, end) {
  try {
    const parse = (s) => {
      const [m, y] = s.split("/");
      return new Date(+y, +m - 1, 1);
    };
    const s = parse(start),
      e = end && !/atual/i.test(end) ? parse(end) : new Date();
    let months =
      (e.getFullYear() - s.getFullYear()) * 12 +
      (e.getMonth() - s.getMonth()) +
      1;
    months = Math.max(months, 1);
    const yr = Math.floor(months / 12),
      rm = months % 12;
    if (yr === 0) return `${rm} ${rm === 1 ? "mês" : "meses"}`;
    if (rm === 0) return `${yr} ${yr === 1 ? "ano" : "anos"}`;
    return `${yr} ${yr === 1 ? "ano" : "anos"} e ${rm} ${rm === 1 ? "mês" : "meses"}`;
  } catch {
    return "";
  }
}
function renderPreview() {
  const p = collectProfile(),
    paper = document.getElementById("paper"),
    empty = document.getElementById("preview-empty");
  if (!p.name && !p.resumo && !p.experience.length) {
    paper.style.display = "none";
    empty.style.display = "flex";
    return;
  }
  paper.style.display = "block";
  empty.style.display = "none";
  paper.style.setProperty("--pac", p.theme_accent || "#1b3a6b");
  paper.style.setProperty("--pmuted", p.theme_muted || "#555");
  const showBadge = document.getElementById("f-badge").checked;
  const h = (s) =>
    (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  let html = `<div class="p-name">${h(p.name)}</div>`;
  if (p.location || p.phone || p.email) {
    html += `<div class="p-contact">${h(p.location)}</div>`;
    html += `<div class="p-contact">${h(p.phone)}${p.phone && p.email ? " · " : ""}${h(p.email)}</div>`;
  }
  if (p.linkedin_label || p.github_label) {
    const li = p.linkedin_url
      ? `<a href="${h(p.linkedin_url)}">${h(p.linkedin_label)}</a>`
      : h(p.linkedin_label);
    const gh = p.github_url
      ? `<a href="${h(p.github_url)}">${h(p.github_label)}</a>`
      : h(p.github_label);
    html += `<div class="p-links">${li}&nbsp;&nbsp;&nbsp;${gh}</div>`;
  }
  html += `<hr class="p-divider">`;
  if (p.resumo)
    html += `<div class="p-section">Resumo Profissional</div><div class="p-indent"><div class="p-body">${h(p.resumo)}</div></div><hr class="p-divider">`;
  if (p.experience.length) {
    html += `<div class="p-section">Histórico Profissional</div>`;
    p.experience.forEach((job, i) => {
      if (i > 0) html += `<div style="height:4px"></div>`;
      const dur =
        job.start_date && /\d{2}\/\d{4}/.test(job.start_date)
          ? calcDuration(job.start_date, job.end_date)
          : "";
      html += `<div class="p-indent"><div class="p-job-grid"><div>${showBadge && dur ? `<span class="p-badge">${h(dur)}</span><br>` : ""}
        <div class="p-dates">${h(job.start_date)} - ${h(job.end_date || "Atual")}</div></div>
        <div><div class="p-title">${h(job.title)}</div><div class="p-company">${h(job.company)}${job.company && job.location ? " · " : ""}${h(job.location)}</div>
        ${(job.bullets || [])
          .filter(Boolean)
          .map((b) => `<div class="p-bullet">${h(b)}</div>`)
          .join("")}</div></div></div>`;
    });
    html += `<hr class="p-divider">`;
  }
  if (p.technologies.length)
    html += `<div class="p-section">Tecnologias</div><div class="p-indent">${p.technologies.map((t) => `<div class="p-bullet">${h(t)}</div>`).join("")}</div><hr class="p-divider">`;
  if (p.education.length) {
    html += `<div class="p-section">Formação Acadêmica</div>`;
    p.education.forEach((edu, i) => {
      if (i > 0) html += `<div style="height:3px"></div>`;
      html += `<div class="p-indent"><div class="p-edu-grid"><div class="p-edu-dates">${h(edu.dates)}</div>
        <div><div class="p-edu-degree">${h(edu.degree)}</div><div class="p-edu-inst">${h(edu.institution)}</div><div class="p-edu-status">Status · ${h(edu.status)}</div></div></div></div>`;
    });
    html += `<hr class="p-divider">`;
  }
  if (p.skills.length) {
    const half = Math.ceil(p.skills.length / 2);
    html += `<div class="p-section">Habilidades e Competências</div><div class="p-indent"><div class="p-skills-grid">
      <div>${p.skills
        .slice(0, half)
        .map((s) => `<div class="p-bullet">${h(s)}</div>`)
        .join("")}</div>
      <div>${p.skills
        .slice(half)
        .map((s) => `<div class="p-bullet">${h(s)}</div>`)
        .join("")}</div>
    </div></div><hr class="p-divider">`;
  }
  if (p.languages.length)
    html += `<div class="p-section">Idiomas</div><div class="p-indent">${p.languages.map((l) => `<div class="p-body">${h(l)}</div>`).join("")}</div>`;
  if (p.custom_sections && p.custom_sections.length) {
    p.custom_sections.forEach((cs) => {
      if (cs.items && cs.items.length)
        html += `<hr class="p-divider"><div class="p-section">${h(cs.name)}</div><div class="p-indent">${cs.items.map((i) => `<div class="p-bullet">${h(i)}</div>`).join("")}</div>`;
    });
  }
  paper.innerHTML = html;
}

// ── Helpers ───────────────────────────────────────────────────
function toggleSection(header) {
  header.nextElementSibling.classList.toggle("open");
  header.querySelector(".chevron").classList.toggle("open");
}
function updateCount(id, n) {
  const el = document.getElementById(id);
  if (el) el.textContent = n;
}
function syncColor(key) {
  document.getElementById(`f-${key}`).value = document.getElementById(
    `f-${key}-picker`,
  ).value;
  schedulePreview();
}
function syncColorText(key) {
  const v = document.getElementById(`f-${key}`).value;
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
    document.getElementById(`f-${key}-picker`).value = v;
    schedulePreview();
  }
}
function syncFontSize(key) {
  document.getElementById(`f-fs-${key}-val`).textContent =
    document.getElementById(`f-fs-${key}`).value + "pt";
  schedulePreview();
}
function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape")
    document
      .querySelectorAll(".modal-backdrop.open")
      .forEach((m) => m.classList.remove("open"));
});
let toastTimer;
function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 3000);
}
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function ea(s) {
  return esc(s);
}

// ── Tooltip positioning (fixed, never clipped) ────────────
document.addEventListener("mouseover", (e) => {
  const tip = e.target.closest(".tip");
  if (!tip) return;
  tip.classList.add("tip-open");
  const rect = tip.getBoundingClientRect();
  // Use a real element trick: set CSS custom props for position
  const bubbleW = 230,
    gap = 10;
  let left = rect.left + rect.width / 2 - bubbleW / 2;
  let top = rect.top - gap; // will go upward via transform in CSS
  // Clamp horizontally
  left = Math.max(8, Math.min(left, window.innerWidth - bubbleW - 8));
  tip.style.setProperty("--tip-left", left + "px");
  tip.style.setProperty("--tip-top", top + "px");
});
document.addEventListener("mouseout", (e) => {
  const tip = e.target.closest(".tip");
  if (tip) tip.classList.remove("tip-open");
});
