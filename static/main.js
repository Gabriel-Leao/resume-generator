let profiles = [],
  activeId = null,
  isDirty = false;
let _savedSnapshot = null;
let previewOpen = false,
  previewTimer = null;
let _deleteSectionId = null,
  _deleteSectionEl = null;
let _nextSectionId = 1;

const supportsFilePicker = !!window.showSaveFilePicker;
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
let _pendingDirHandle = null;
const savedTheme = localStorage.getItem("rg_theme") || "dark";
applyTheme(savedTheme);
loadSettings();

fetch("/api/fonts")
  .then((r) => r.json())
  .then((families) => {
    const sel = document.getElementById("f-font-family");
    families.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  })
  .catch(() => {});

fetch("/api/profiles")
  .then((r) => r.json())
  .then((data) => {
    profiles = data;
    renderSidebar();
    if (profiles.length > 0) selectProfile(profiles[0].id);
  });
refreshTrashCount();
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
    projects: [],
    languages: [],
    custom_sections: [],
    font_family: "",
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
  V("f-font-family", p.font_family || "");
  V("f-muted", p.theme_muted || "#555555");
  document.getElementById("f-muted-picker").value = p.theme_muted || "#555555";
  document.getElementById("f-badge").checked = p.show_badge === true;
  clearAllErrors();
  document.getElementById("exp-list").innerHTML = "";
  (p.experience || []).forEach(addExperience);
  document.getElementById("edu-list").innerHTML = "";
  (p.education || []).forEach(addEducation);
  renderSimpleList("lang-list", p.languages || []);
  document.getElementById("tech-groups").innerHTML = "";
  const techData = p.technologies || [];
  if (techData.length && typeof techData[0] === "object") {
    techData.forEach(g => addTechGroup(g));
  } else if (techData.length) {
    techData.forEach(line => {
      const colon = line.indexOf(":");
      if (colon > -1) {
        addTechGroup({ title: line.slice(0, colon).trim(), items: line.slice(colon + 1).split(",").map(s => s.trim()).filter(Boolean) });
      } else {
        addTechGroup({ title: "", items: [line] });
      }
    });
  } else {
    addTechGroup();
  }
  renderSimpleList("skills-list", (() => {
    const sd = p.skills || [];
    if (!sd.length) return [];
    if (typeof sd[0] === "object") return sd.flatMap(g => g.items || []);
    return sd;
  })());
  document.getElementById("proj-list").innerHTML = "";
  (p.projects || []).forEach(addProject);
  updateCount("exp-count", (p.experience || []).length);
  updateCount("edu-count", (p.education || []).length);
  updateCount("proj-count", (p.projects || []).length);
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
function addSkillGroup(data = {}) {
  const el = document.createElement("div");
  el.className = "skill-group";
  el.innerHTML = `
    <div class="skill-group-header">
      <input class="skill-group-title" type="text" value="${ea(data.title || "")}" placeholder="Frontend, Backend, Ferramentas...">
      <button class="btn-rm-bullet" onclick="this.closest('.skill-group').remove()">✕</button>
    </div>
    <div class="skill-items simple-list"></div>
    <button class="btn-add-item" style="margin-top:4px" onclick="addSimpleToEl(this.previousElementSibling,'')">+ item</button>`;
  document.getElementById("skills-groups").appendChild(el);
  const list = el.querySelector(".skill-items");
  (data.items || []).forEach(v => addSimpleToEl(list, v));
  if (!(data.items || []).length) addSimpleToEl(list, "");
}
function addTechGroup(data = {}) {
  const el = document.createElement("div");
  el.className = "skill-group";
  el.innerHTML = `
    <div class="skill-group-header">
      <input class="skill-group-title" type="text" value="${ea(data.title || "")}" placeholder="Frontend, Backend, Ferramentas...">
      <button class="btn-rm-bullet" onclick="this.closest('.skill-group').remove()">✕</button>
    </div>
    <div class="skill-items simple-list"></div>
    <button class="btn-add-item" style="margin-top:4px" onclick="addSimpleToEl(this.previousElementSibling,'')">+ item</button>`;
  document.getElementById("tech-groups").appendChild(el);
  const list = el.querySelector(".skill-items");
  (data.items || []).forEach(v => addSimpleToEl(list, v));
  if (!(data.items || []).length) addSimpleToEl(list, "");
}
function addSimpleToEl(list, v = "") {
  const r = document.createElement("div");
  r.className = "simple-row";
  r.innerHTML = `<input type="text" value="${ea(v)}" placeholder="...">
    <button class="btn-rm-bullet" onclick="this.parentElement.remove()">✕</button>`;
  list.appendChild(r);
}
function addProject(data = {}) {
  const el = document.createElement("div");
  el.className = "repeat-item proj-card";
  const idx = document.querySelectorAll("#proj-list .repeat-item").length + 1;
  el.innerHTML = `
    <div class="repeat-item-header">
      <span class="repeat-item-num">Proj ${idx}</span>
      <button class="btn-remove-item" onclick="removeRepeat(this,'proj-list','proj-count')">✕ remover</button>
    </div>
    <div class="field"><label class="field-label">Nome do projeto</label>
      <input class="proj-name" type="text" value="${ea(data.name)}" placeholder="Meu Projeto"></div>
    <div class="field"><label class="field-label">Descrição</label>
      <textarea class="proj-desc" rows="2" placeholder="Breve descrição do projeto e suas features...">${ea(data.description)}</textarea></div>
    <div class="proj-links-box">
      <label class="field-label">Links</label>
      <div class="proj-links-list"></div>
      <button class="btn-add-item proj-add-link" onclick="addProjectLink(this.previousElementSibling)">+ Adicionar link</button>
    </div>`;
  document.getElementById("proj-list").appendChild(el);
  const linksEl = el.querySelector(".proj-links-list");
  (data.links || []).forEach(l => addProjectLinkTo(linksEl, l));
  if (!(data.links || []).length) addProjectLinkTo(linksEl, {});
  updateCount("proj-count", document.querySelectorAll("#proj-list .repeat-item").length);
}
function addProjectLink(list) { addProjectLinkTo(list, {}); }
function addProjectLinkTo(list, data = {}) {
  const r = document.createElement("div");
  r.className = "proj-link-row";
  r.innerHTML = `<input class="proj-link-label" type="text" value="${ea(data.label)}" placeholder="Produção, Código, Demo..." list="proj-link-suggestions">
    <input class="proj-link-url" type="text" value="${ea(data.url)}" placeholder="https://...">
    <button class="btn-rm-bullet" onclick="this.parentElement.remove()">✕</button>`;
  list.appendChild(r);
}
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
    technologies: [...document.querySelectorAll("#tech-groups .skill-group")].map(el => ({
      title: el.querySelector(".skill-group-title").value.trim(),
      items: [...el.querySelectorAll(".skill-items input")].map(i => i.value.trim()).filter(Boolean),
    })).filter(g => g.items.length),
    skills: getSimpleList("skills-list"),
    projects: [...document.querySelectorAll("#proj-list .repeat-item")].map(el => ({
      name: el.querySelector(".proj-name").value.trim(),
      description: el.querySelector(".proj-desc").value.trim(),
      links: [...el.querySelectorAll(".proj-link-row")].map(r => ({
        label: r.querySelector(".proj-link-label").value.trim(),
        url: r.querySelector(".proj-link-url").value.trim(),
      })).filter(r => r.url),
      techs: [],
    })).filter(p => p.name),
    languages: getSimpleList("lang-list"),
    custom_sections,
    font_family: G("f-font-family"),
    theme_accent: G("f-accent"),
    theme_body: G("f-body"),
    theme_muted: G("f-muted"),
    show_badge: document.getElementById("f-badge").checked,
  };
}
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
  if (!activeId) {
    resetToEmpty();
    return;
  }
  if (!confirm("Mover este perfil para a lixeira? Você poderá restaurá-lo em até 30 dias.")) return;
  fetch(`/api/profiles/${activeId}`, { method: "DELETE" })
    .then(() => fetch("/api/profiles").then((r) => r.json()))
    .then((data) => {
      profiles = data;
      activeId = null;
      renderSidebar();
      resetToEmpty();
      refreshTrashCount();
      toast("Perfil movido para a lixeira");
    });
}
function resetToEmpty() {
  document.getElementById("editor").style.display = "none";
  document.getElementById("empty-state").style.display = "flex";
  document.getElementById("topbar-actions").style.display = "none";
  document.getElementById("topbar-title").textContent = "Resume Generator";
  setDirty(false);
}

/* ── Lixeira ────────────────────────────────────────────────── */
function refreshTrashCount() {
  fetch("/api/trash")
    .then((r) => r.json())
    .then((items) => {
      const badge = document.getElementById("trash-count");
      if (items.length) {
        badge.textContent = items.length;
        badge.style.display = "inline-flex";
      } else {
        badge.style.display = "none";
      }
    })
    .catch(() => {});
}

function daysRemaining(deletedAt) {
  const deleted = new Date(deletedAt);
  const expires = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000);
  const diff = Math.ceil((expires - new Date()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}

function openTrash() {
  fetch("/api/trash")
    .then((r) => r.json())
    .then((items) => {
      renderTrash(items);
      openModal("modal-trash");
    });
}

function renderTrash(items) {
  const el = document.getElementById("trash-list");
  if (!items.length) {
    el.innerHTML = `<div style="padding:20px 4px;text-align:center;color:var(--text3);font-size:12.5px">A lixeira está vazia.</div>`;
    return;
  }
  el.innerHTML = items
    .map((p) => {
      const days = daysRemaining(p.deleted_at);
      return `
    <div class="trash-item" data-id="${p.id}">
      <div class="trash-item-info">
        <div class="trash-item-label">${esc(p.label || p.name || "Sem nome")}</div>
        <div class="trash-item-meta">${esc(p.name || "")}${p.version ? " · " + esc(p.version) : ""} · expira em ${days} dia${days === 1 ? "" : "s"}</div>
      </div>
      <div class="trash-item-actions">
        <button class="btn btn-ghost" onclick="restoreFromTrash('${p.id}')">Restaurar</button>
        <button class="btn btn-danger" onclick="deletePermanently('${p.id}')">Apagar definitivamente</button>
      </div>
    </div>`;
    })
    .join("");
}

function restoreFromTrash(id) {
  fetch(`/api/trash/${id}/restore`, { method: "POST" })
    .then((r) => r.json())
    .then(() => Promise.all([
      fetch("/api/profiles").then((r) => r.json()),
      fetch("/api/trash").then((r) => r.json()),
    ]))
    .then(([profilesData, trashData]) => {
      profiles = profilesData;
      renderSidebar();
      renderTrash(trashData);
      refreshTrashCount();
      toast("Perfil restaurado!", "success");
    });
}

function deletePermanently(id) {
  if (!confirm("Apagar este perfil definitivamente? Essa ação não pode ser desfeita.")) return;
  fetch(`/api/trash/${id}`, { method: "DELETE" })
    .then((r) => r.json())
    .then(() => fetch("/api/trash").then((r) => r.json()))
    .then((trashData) => {
      renderTrash(trashData);
      refreshTrashCount();
      toast("Perfil apagado definitivamente");
    });
}
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
async function saveAndGenerate() {
  closeModal("modal-unsaved-generate");
  saveProfile();
  await generate(collectProfile());
}
async function generateWithoutSaving() {
  closeModal("modal-unsaved-generate");
  if (!_savedSnapshot) {
    toast("Nenhuma versão salva encontrada", "error");
    return;
  }
  await generate(JSON.parse(_savedSnapshot));
}
async function generate(forceProfile = null) {
  if (!validate()) {
    toast("Corrija os campos obrigatórios antes de gerar", "error");
    return;
  }
  if (!forceProfile && isDirty) {
    openModal("modal-unsaved-generate");
    return;
  }
  const profile = forceProfile || collectProfile();
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
async function saveBlob(blob, filename) {
  if (!supportsFilePicker) {
    triggerDownload(blob, filename);
    return;
  }

  const alwaysAsk = localStorage.getItem("rg_always_ask") === "1";
  const savedDir = await idbGet("rg_dir_handle").catch(() => null);

  if (!alwaysAsk && savedDir) {
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
      await idbDel("rg_dir_handle");
      localStorage.removeItem("rg_dir_name");
      updateDirHint("");
    }
  }
  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
    });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    if (!savedDir && !alwaysAsk && !localStorage.getItem("rg_dir_name")) {
      _pendingDirHandle = null;
      openModal("modal-save-dir");
      document.getElementById("modal-dir-name").textContent =
        "uma pasta padrão";
    }
  } catch (err) {
    if (err.name === "AbortError") return;
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
  const techGroups = (p.technologies || []).filter(g => typeof g === "object" && g.items && g.items.length);
  const techFlat = (p.technologies || []).filter(g => typeof g === "string");
  if (techGroups.length) {
    html += `<div class="p-section">Tecnologias</div><div class="p-indent">`;
    techGroups.forEach(g => {
      html += `<div class="p-skills-group"><span class="p-skills-group-title">${h(g.title || "")}</span><div class="p-skills-inline">${g.items.map(s => `<span class="p-skill-tag">${h(s)}</span>`).join("")}</div></div>`;
    });
    html += `</div><hr class="p-divider">`;
  } else if (techFlat.length) {
    html += `<div class="p-section">Tecnologias</div><div class="p-indent">${techFlat.map((t) => `<div class="p-bullet">${h(t)}</div>`).join("")}</div><hr class="p-divider">`;
  }
  if (p.education.length) {
    html += `<div class="p-section">Formação Acadêmica</div>`;
    p.education.forEach((edu, i) => {
      if (i > 0) html += `<div style="height:3px"></div>`;
      html += `<div class="p-indent"><div class="p-edu-grid"><div class="p-edu-dates">${h(edu.dates)}</div>
        <div><div class="p-edu-degree">${h(edu.degree)}</div><div class="p-edu-inst">${h(edu.institution)}</div><div class="p-edu-status">Status · ${h(edu.status)}</div></div></div></div>`;
    });
    html += `<hr class="p-divider">`;
  }
  const skillsFlat = (p.skills || []).filter(g => typeof g === "string");
  const skillsGrouped = (p.skills || []).filter(g => typeof g === "object" && g.items && g.items.length);
  const allSkills = skillsFlat.length ? skillsFlat : skillsGrouped.flatMap(g => g.items || []);
  if (allSkills.length) {
    const half = Math.ceil(allSkills.length / 2);
    html += `<div class="p-section">Habilidades e Competências</div><div class="p-indent"><div class="p-skills-grid">
      <div>${allSkills.slice(0, half).map(s => `<div class="p-bullet">${h(s)}</div>`).join("")}</div>
      <div>${allSkills.slice(half).map(s => `<div class="p-bullet">${h(s)}</div>`).join("")}</div>
    </div></div><hr class="p-divider">`;
  }
  if ((p.projects || []).filter(pr => pr.name).length) {
    html += `<div class="p-section">Projetos</div>`;
    p.projects.filter(pr => pr.name).forEach((pr, i) => {
      if (i > 0) html += `<div style="height:6px"></div>`;
      const links = (pr.links || []).filter(l => l.url);
      const linksHtml = links.map(l => `<a class="p-proj-link" href="${h(l.url)}">${h(l.label || l.url)}</a>`).join(`<span class="p-proj-link-sep">·</span>`);
      html += `<div class="p-indent p-proj">
        <div class="p-proj-name">${h(pr.name)}</div>
        ${pr.description ? `<div class="p-proj-desc">${h(pr.description)}</div>` : ""}
        ${linksHtml ? `<div class="p-proj-links-row">${linksHtml}</div>` : ""}
      </div>`;
    });
    html += `<hr class="p-divider">`;
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
document.addEventListener("mouseover", (e) => {
  const tip = e.target.closest(".tip");
  if (!tip) return;
  tip.classList.add("tip-open");
  const rect = tip.getBoundingClientRect();
  const bubbleW = 230,
    gap = 10;
  let left = rect.left + rect.width / 2 - bubbleW / 2;
  let top = rect.top - gap;
  left = Math.max(8, Math.min(left, window.innerWidth - bubbleW - 8));
  tip.style.setProperty("--tip-left", left + "px");
  tip.style.setProperty("--tip-top", top + "px");
});
document.addEventListener("mouseout", (e) => {
  const tip = e.target.closest(".tip");
  if (tip) tip.classList.remove("tip-open");
});
function toggleSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const isOpen = sidebar.classList.toggle("open");
  overlay.classList.toggle("show", isOpen);
  document.body.style.overflow = isOpen ? "hidden" : "";
}
function closeSidebar() {
  document.querySelector(".sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("show");
  document.body.style.overflow = "";
}
const _origRenderSidebar = renderSidebar;
const _origSelectProfile = selectProfile;
window.selectProfile = function (id) {
  _origSelectProfile(id);
  if (window.innerWidth < 1024) closeSidebar();
};
let mobilePreviewOpen = false;
function toggleMobilePreview() {
  mobilePreviewOpen = !mobilePreviewOpen;
  const modal = document.getElementById("mobile-preview-modal");
  modal.classList.toggle("open", mobilePreviewOpen);
  document.body.style.overflow = mobilePreviewOpen ? "hidden" : "";
  if (mobilePreviewOpen) renderMobilePreview();
}

function renderMobilePreview() {
  const desktop = document.getElementById("paper");
  const mobile = document.getElementById("paper-mobile");
  if (!mobile) return;
  if (desktop && desktop.innerHTML) {
    mobile.innerHTML = desktop.innerHTML;
    const accent = desktop.style.getPropertyValue("--pac");
    const muted = desktop.style.getPropertyValue("--pmuted");
    if (accent) mobile.style.setProperty("--pac", accent);
    if (muted) mobile.style.setProperty("--pmuted", muted);
  } else {
    const p = collectProfile();
    if (p.name || p.resumo) {
      const tmp = document.getElementById("paper");
      renderPreview();
      mobile.innerHTML = tmp ? tmp.innerHTML : "";
    }
  }
}
const _origSetDirty = setDirty;
window.setDirty = function (v) {
  _origSetDirty(v);
  const mBtn = document.getElementById("mobile-btn-save");
  if (mBtn) mBtn.disabled = !v;
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && mobilePreviewOpen) toggleMobilePreview();
});
