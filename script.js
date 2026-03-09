/* =============================================================
   Pen To Text — script.js
   =============================================================
   Structure:
     1.  State & Defaults
     2.  DOM References
     3.  Persistence (save / load)
     4.  Utility helpers
     5.  Category rendering (sidebar)
     6.  Category rendering (modal chips)
     7.  Note card rendering
     8.  Main notes display
     9.  Note CRUD operations
    10.  Pin toggle
    11.  Archive / Deleted views
    12.  Undo delete
    13.  Import / Export
    14.  Speech recognition
    15.  Modal helpers
    16.  Settings / Customization
    17.  Event wiring
    18.  Initialisation
   ============================================================= */

/* -------------------------------------------------------------
   1. State & Defaults
   ------------------------------------------------------------- */
const DEFAULTS = {
  categoryColor: "#4ea8ff",
  noteColor:     "#ffffff",
  sort:          "dateDesc",
  categories: [
    { name: "All Notes", color: "#9aaefc" },
    { name: "Work",      color: "#4ea8ff" },
    { name: "Personal",  color: "#7be88a" },
    { name: "Ideas",     color: "#f0c929" }
  ]
};

let notes          = [];
let archivedNotes  = [];
let recentlyDeleted = [];
let categories     = [];

let currentCategory    = "All Notes";
let currentSort        = DEFAULTS.sort;
let defaultCategoryColor = DEFAULTS.categoryColor;
let defaultNoteColor     = DEFAULTS.noteColor;

let showingArchived = false;
let showingDeleted  = false;

let isEditing     = false;
let editingNoteId = null;
let lastDeleted   = null;
let undoTimer     = null;

let recognition  = null;
let recognizing  = false;

const NOTE_ID = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* -------------------------------------------------------------
   2. DOM References
   ------------------------------------------------------------- */
const $ = id => document.getElementById(id);

const searchBar            = $("searchBar");
const sortSelect           = $("sortNotes");
const voiceBtn             = $("voiceBtn");
const addNoteBtn           = $("addNoteBtn");
const viewArchivedBtn      = $("viewArchivedBtn");
const viewDeletedBtn       = $("viewDeletedBtn");
const undoBtn              = $("undoBtn");
const themeToggle          = $("themeToggle");
const customizeBtn         = $("customizeBtn");

const categorySearch       = $("categorySearch");
const newCategoryInput     = $("newCategoryInput");
const categoryColorPicker  = $("categoryColorPicker");
const addCategoryBtn       = $("addCategoryBtn");
const categoryList         = $("categoryList");

const notesContainer       = $("notesContainer");

const noteModal            = $("noteModal");
const closeModal           = $("closeModal");
const modalTitle           = $("modalTitle");
const noteTitleEl          = $("noteTitle");
const noteContentEl        = $("noteContent");
const noteCategoryOptions  = $("noteCategoryOptions");
const noteColorPicker      = $("noteColorPicker");
const noteImageInput       = $("noteImage");
const modalVoiceBtn        = $("modalVoiceBtn");
const saveNoteBtn          = $("saveNoteBtn");
const cancelBtn            = $("cancelBtn");

const customizeModal          = $("customizeModal");
const closeCustomize          = $("closeCustomize");
const defaultCategoryColorEl  = $("defaultCategoryColor");
const defaultNoteColorEl      = $("defaultNoteColor");
const applyCustomizationBtn   = $("applyCustomizationBtn");
const resetDataBtn            = $("resetDataBtn");

/* -------------------------------------------------------------
   3. Persistence
   ------------------------------------------------------------- */
function saveData() {
  localStorage.setItem("notes",           JSON.stringify(notes));
  localStorage.setItem("archivedNotes",   JSON.stringify(archivedNotes));
  localStorage.setItem("recentlyDeleted", JSON.stringify(recentlyDeleted));
  localStorage.setItem("categories",      JSON.stringify(categories));
  localStorage.setItem("defaultCategoryColor", defaultCategoryColor);
  localStorage.setItem("defaultNoteColor",     defaultNoteColor);
  localStorage.setItem("currentCategory",      currentCategory);
  localStorage.setItem("currentSort",          currentSort);
  localStorage.setItem("theme",
    document.documentElement.getAttribute("data-theme") || "");
}

function loadData() {
  const get = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };

  notes           = get("notes",           []).filter(n => n?.id);
  archivedNotes   = get("archivedNotes",   []).filter(n => n?.id);
  recentlyDeleted = get("recentlyDeleted", []).filter(n => n?.id);
  categories      = get("categories",      DEFAULTS.categories).filter(c => c?.name);

  defaultCategoryColor = localStorage.getItem("defaultCategoryColor") || DEFAULTS.categoryColor;
  defaultNoteColor     = localStorage.getItem("defaultNoteColor")     || DEFAULTS.noteColor;
  currentCategory      = localStorage.getItem("currentCategory")      || "All Notes";
  currentSort          = localStorage.getItem("currentSort")          || DEFAULTS.sort;

  const theme = localStorage.getItem("theme");
  if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
}

/* -------------------------------------------------------------
   4. Utility Helpers
   ------------------------------------------------------------- */
function escapeHTML(s) {
  if (!s) return "";
  return s
    .replaceAll("&",  "&amp;")
    .replaceAll("<",  "&lt;")
    .replaceAll(">",  "&gt;")
    .replaceAll('"',  "&quot;")
    .replaceAll("'",  "&#39;");
}

function clamp(s, n = 300) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function wordCount(text) {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function findCategory(name) {
  return categories.find(c => c.name === name) || null;
}

function ensureAllNotesCategory() {
  if (!categories.find(c => c.name === "All Notes")) {
    categories.unshift({ name: "All Notes", color: defaultCategoryColor });
  }
}

/** Converts a hex color to a dark-mode-friendly version by darkening it */
function darkAdaptColor(hex) {
  if (!hex || !hex.startsWith("#")) return "var(--panel2)";
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  const lum = (r * 0.299 + g * 0.587 + b * 0.114);
  // If near-white or very light, use panel2
  if (lum > 220) return "var(--panel2)";
  // If light (pastel range), darken significantly and desaturate slightly
  if (lum > 140) {
    const dr = Math.round(r * 0.28);
    const dg = Math.round(g * 0.28);
    const db = Math.round(b * 0.28);
    return `rgb(${dr},${dg},${db})`;
  }
  // Mid-range: moderate darkening
  if (lum > 80) {
    const dr = Math.round(r * 0.45);
    const dg = Math.round(g * 0.45);
    const db = Math.round(b * 0.45);
    return `rgb(${dr},${dg},${db})`;
  }
  // Already dark — use as-is or slightly lighten for visibility
  return hex;
}

/** Returns a CSS background value for a note card. */
function noteBackground(note) {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  const adapt = (color) => isDark ? darkAdaptColor(color) : color;

  if (note.color && note.color !== "#ffffff") {
    return adapt(note.color);
  }
  if (Array.isArray(note.category) && note.category.length) {
    const colors = note.category
      .map(n => findCategory(n)?.color || defaultCategoryColor)
      .filter(Boolean);
    if (colors.length === 1) return adapt(colors[0]);
    if (colors.length > 1) {
      if (isDark) return adapt(colors[0]); // gradient looks bad darkened, use first
      return `linear-gradient(135deg, ${colors.join(", ")})`;
    }
  }
  if (isDark) return "var(--panel2)";
  return note.color || defaultNoteColor;
}

/** Returns true if a hex color is white or very light */
function isNearWhite(hex) {
  if (!hex || !hex.startsWith("#")) return false;
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 216;
}

/** Sort a copy of an array of notes by currentSort. */
function sortNotes(arr) {
  const copy = [...arr];
  switch (currentSort) {
    case "dateAsc":
      return copy.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    case "titleAsc":
      return copy.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    case "titleDesc":
      return copy.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
    case "editedDesc":
      return copy.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    case "editedAsc":
      return copy.sort((a, b) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0));
    case "wordCountDesc":
      return copy.sort((a, b) => wordCount(b.content) - wordCount(a.content));
    case "wordCountAsc":
      return copy.sort((a, b) => wordCount(a.content) - wordCount(b.content));
    case "color":
      // Group by background color — notes with same color cluster together
      return copy.sort((a, b) => {
        const ca = noteBackground(a).split(",")[0].trim();
        const cb = noteBackground(b).split(",")[0].trim();
        return ca.localeCompare(cb);
      });
    default: // dateDesc
      return copy.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
}

/* Auto-purge deleted notes older than 3 days */
function autoPurge() {
  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  recentlyDeleted = recentlyDeleted.filter(n => !n.deletedAt || n.deletedAt > cutoff);
  saveData();
}

/* -------------------------------------------------------------
   5. Category Rendering — Sidebar
   ------------------------------------------------------------- */
function renderCategories(filter = "") {
  ensureAllNotesCategory();
  categoryList.innerHTML = "";

  const q = filter.trim().toLowerCase();

  categories
    .filter(c => c?.name?.toLowerCase().includes(q))
    .forEach(cat => {
      const li = document.createElement("li");
      if (cat.name === currentCategory) li.classList.add("active");

      // Colour dot
      const dot = document.createElement("span");
      dot.className = "cat-dot";
      dot.style.backgroundColor = cat.color || defaultCategoryColor;

      // Label
      const label = document.createElement("span");
      label.className = "cat-label";
      label.textContent = cat.name;

      // Controls (edit / delete)
      const controls = document.createElement("div");
      controls.className = "cat-controls";

      if (cat.name !== "All Notes") {
        const editBtn = document.createElement("button");
        editBtn.className = "cat-edit-btn";
        editBtn.title = "Rename / recolor";
        editBtn.textContent = "✏️";

        const delBtn = document.createElement("button");
        delBtn.className = "cat-del-btn";
        delBtn.title = "Delete category";
        delBtn.textContent = "×";

        controls.append(editBtn, delBtn);

        // Edit category
        editBtn.addEventListener("click", e => {
          e.stopPropagation();
          const newName = prompt("Rename category:", cat.name)?.trim();
          if (!newName) return;
          if (categories.some(c => c.name === newName && c !== cat)) {
            alert("A category with that name already exists.");
            return;
          }
          const newColor = prompt("Category color (hex, e.g. #4ea8ff):", cat.color || defaultCategoryColor)?.trim() || cat.color;
          [notes, archivedNotes, recentlyDeleted].forEach(arr =>
            arr.forEach(n => {
              if (Array.isArray(n.category))
                n.category = n.category.map(c => c === cat.name ? newName : c);
            })
          );
          if (currentCategory === cat.name) currentCategory = newName;
          cat.name  = newName;
          cat.color = newColor;
          saveData();
          renderCategories(categorySearch.value);
          renderNotes();
        });

        // Delete category
        delBtn.addEventListener("click", e => {
          e.stopPropagation();
          if (!confirm(`Delete category "${cat.name}"? Notes will lose this tag.`)) return;
          categories = categories.filter(c => c.name !== cat.name);
          [notes, archivedNotes, recentlyDeleted].forEach(arr =>
            arr.forEach(n => {
              if (Array.isArray(n.category))
                n.category = n.category.filter(c => c !== cat.name);
            })
          );
          if (currentCategory === cat.name) currentCategory = "All Notes";
          saveData();
          renderCategories(categorySearch.value);
          renderNotes();
        });
      }

      li.append(dot, label, controls);
      categoryList.appendChild(li);

      /* --- Interactions --- */

      // Select category
      li.addEventListener("click", e => {
        if (e.target.closest(".cat-controls")) return;
        currentCategory = cat.name;
        showingArchived = false;
        showingDeleted  = false;
        renderCategories(categorySearch.value);
        renderNotes();
      });
    });
}

/* -------------------------------------------------------------
   6. Category Rendering — Modal Chips
   ------------------------------------------------------------- */
function renderModalCategories(selected = []) {
  noteCategoryOptions.innerHTML = "";
  categories
    .filter(c => c?.name && c.name !== "All Notes")
    .forEach(cat => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.category = cat.name;
      btn.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${cat.color || defaultCategoryColor};display:inline-block;"></span>${cat.name}`;
      if (selected.includes(cat.name)) btn.classList.add("selected");
      btn.addEventListener("click", () => btn.classList.toggle("selected"));
      noteCategoryOptions.appendChild(btn);
    });
}

/* -------------------------------------------------------------
   7. Note Card
   ------------------------------------------------------------- */
function createCard(note, context) {
  const card = document.createElement("div");
  card.className = "note-card";
  // Add context class so CSS can always show controls for archive/deleted
  if (context === "archived") card.classList.add("ctx-archived");
  if (context === "deleted")  card.classList.add("ctx-deleted");
  card.style.background = noteBackground(note);

  /* Pin button */
  const pinBtn = document.createElement("button");
  pinBtn.className = "pin-btn";
  pinBtn.innerHTML = note.pinned ? "📌" : "📍";
  pinBtn.title = note.pinned ? "Unpin" : "Pin";
  pinBtn.addEventListener("click", e => { e.stopPropagation(); togglePin(note.id); });
  card.appendChild(pinBtn);

  /* Title */
  if (note.title?.trim()) {
    const h3 = document.createElement("h3");
    h3.textContent = note.title;
    card.appendChild(h3);
  }

  /* Image */
  if (note.image) {
    const img = document.createElement("img");
    img.src = note.image;
    img.alt = note.title || "Note image";
    card.appendChild(img);
  }

  /* Content preview */
  const preview = document.createElement("div");
  preview.className = "note-preview";
  preview.style.whiteSpace = "pre-wrap";
  preview.innerHTML = escapeHTML(clamp(note.content, 300));
  card.appendChild(preview);

  /* Tags */
  if (note.category?.length) {
    const tags = document.createElement("div");
    tags.className = "note-tags";
    note.category.forEach(cn => {
      const obj = findCategory(cn) || { color: defaultCategoryColor };
      const tag = document.createElement("span");
      tag.className = "note-tag";
      tag.textContent = cn;
      tag.style.background = obj.color;
      tags.appendChild(tag);
    });
    card.appendChild(tags);
  }

  /* Meta */
  const meta = document.createElement("div");
  meta.className = "note-meta";
  const parts = [];
  if (note.createdAt) parts.push(new Date(note.createdAt).toLocaleString());
  if (note.updatedAt && note.updatedAt !== note.createdAt) parts.push("Edited");
  meta.textContent = parts.join(" · ");
  card.appendChild(meta);

  /* Action buttons */
  const controls = document.createElement("div");
  controls.className = "card-controls";

  if (context === "notes") {
    controls.append(
      makeBtn("Edit",       "edit-btn",       () => openEditModal(note.id)),
      makeBtn("🃏 Cards",   "flash-btn",      () => openFlashcardManager(note.id)),
      makeBtn("Archive",    "archive-btn",    () => archiveNote(note.id)),
      makeBtn("Delete",     "delete-btn",     () => softDelete(note.id))
    );
  } else if (context === "archived") {
    controls.append(
      makeBtn("Restore", "restore-btn", () => restoreFromArchive(note.id)),
      makeBtn("Delete",  "delete-btn",  () => deleteFromArchive(note.id))
    );
  } else if (context === "deleted") {
    controls.append(
      makeBtn("Restore",          "restore-btn",           () => restoreFromDeleted(note.id)),
      makeBtn("Delete Permanently","permanent-delete-btn", () => permanentDelete(note.id))
    );
  }

  card.appendChild(controls);

  // Only open edit modal when clicking the card body, not action buttons
  card.addEventListener("click", e => {
    if (e.target.closest(".card-controls") || e.target.closest(".pin-btn")) return;
    // In archive/deleted views, don't open edit modal on card click
    if (context === "archived" || context === "deleted") return;
    openEditModal(note.id);
  });
  return card;
}

function makeBtn(label, cls, fn) {
  const btn = document.createElement("button");
  btn.className = cls;
  btn.textContent = label;
  btn.addEventListener("click", e => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  });
  return btn;
}

/* -------------------------------------------------------------
   8. Main Notes Display
   ------------------------------------------------------------- */
function renderNotes() {
  notesContainer.innerHTML = "";

  let context = "notes";
  let list;

  if (showingArchived) {
    context = "archived";
    list = [...archivedNotes];
  } else if (showingDeleted) {
    context = "deleted";
    list = [...recentlyDeleted];
  } else {
    list = [...notes];
    // Filter by category
    if (currentCategory !== "All Notes") {
      list = list.filter(n => n.category?.includes(currentCategory));
    }
  }

  // Search filter
  const q = searchBar.value.trim().toLowerCase();
  if (q) {
    list = list.filter(n =>
      (n.title   || "").toLowerCase().includes(q) ||
      (n.content || "").toLowerCase().includes(q) ||
      (n.category|| []).join(" ").toLowerCase().includes(q)
    );
  }

  // Sort
  list = sortNotes(list);

  // Pinned notes first (main view only)
  if (!showingArchived && !showingDeleted) {
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = showingArchived ? "No archived notes."
      : showingDeleted ? "No recently deleted notes."
      : "No notes yet — click '+ Add Note' to get started.";
    notesContainer.appendChild(empty);
    return;
  }

  list.forEach(n => notesContainer.appendChild(createCard(n, context)));
}

/* -------------------------------------------------------------
   9. Note CRUD
   ------------------------------------------------------------- */
function openNewNoteModal() {
  isEditing     = false;
  editingNoteId = null;
  noteTitleEl.value     = "";
  noteContentEl.value   = "";
  noteColorPicker.value = defaultNoteColor;
  noteImageInput.value  = "";
  renderModalCategories([]);
  openModal();
}

function openEditModal(id) {
  const note = [...notes, ...archivedNotes, ...recentlyDeleted].find(n => n.id === id);
  if (!note) return;
  isEditing     = true;
  editingNoteId = id;
  noteTitleEl.value     = note.title   || "";
  noteContentEl.value   = note.content || "";
  noteColorPicker.value = note.color?.startsWith("#") ? note.color : defaultNoteColor;
  noteImageInput.value  = "";
  renderModalCategories(note.category || []);
  openModal();
}

function saveNote() {
  const title    = noteTitleEl.value.trim();
  const content  = noteContentEl.value;
  const color    = noteColorPicker.value || "";
  const selected = [...noteCategoryOptions.querySelectorAll("button.selected")]
    .map(b => b.dataset.category);

  const file = noteImageInput.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = e => finalize(e.target.result);
    reader.readAsDataURL(file);
  } else {
    finalize(null);
  }

  function finalize(imageBase64) {
    const now = Date.now();
    if (isEditing && editingNoteId) {
      [notes, archivedNotes, recentlyDeleted].forEach(arr => {
        const n = arr.find(x => x.id === editingNoteId);
        if (!n) return;
        n.title     = title;
        n.content   = content;
        n.color     = color;
        n.category  = selected;
        n.updatedAt = now;
        if (imageBase64) n.image = imageBase64;
      });
    } else {
      notes.unshift({
        id:        NOTE_ID(),
        title, content, color,
        category:  selected,
        image:     imageBase64 || null,
        createdAt: now,
        updatedAt: now,
        pinned:    false
      });
    }
    saveData();
    closeNoteModal();
    renderNotes();
  }
}

function softDelete(id) {
  const idx = notes.findIndex(n => n.id === id);
  if (idx === -1) return;
  const [n] = notes.splice(idx, 1);
  n.deletedAt = Date.now();
  recentlyDeleted.unshift(n);
  lastDeleted = { note: n, from: "notes" };
  saveData();
  showUndoBtn();
  renderNotes();
}

function archiveNote(id) {
  const idx = notes.findIndex(n => n.id === id);
  if (idx === -1) return;
  const [n] = notes.splice(idx, 1);
  n.archivedAt = Date.now();
  archivedNotes.unshift(n);
  saveData();
  renderNotes();
}

function restoreFromArchive(id) {
  const idx = archivedNotes.findIndex(n => n.id === id);
  if (idx === -1) return;
  const [n] = archivedNotes.splice(idx, 1);
  notes.unshift(n);
  saveData();
  renderNotes();
}

function deleteFromArchive(id) {
  const idx = archivedNotes.findIndex(n => n.id === id);
  if (idx === -1) return;
  const [n] = archivedNotes.splice(idx, 1);
  n.deletedAt = Date.now();
  recentlyDeleted.unshift(n);
  lastDeleted = { note: n, from: "archive" };
  saveData();
  showUndoBtn();
  renderNotes();
}

function restoreFromDeleted(id) {
  const idx = recentlyDeleted.findIndex(n => n.id === id);
  if (idx === -1) return;
  const [n] = recentlyDeleted.splice(idx, 1);
  notes.unshift(n);
  saveData();
  renderNotes();
}

function permanentDelete(id) {
  if (!confirm("Permanently delete this note? This cannot be undone.")) return;
  recentlyDeleted = recentlyDeleted.filter(n => n.id !== id);
  saveData();
  renderNotes();
}

/* -------------------------------------------------------------
   10. Pin Toggle
   ------------------------------------------------------------- */
function togglePin(id) {
  const n = [...notes, ...archivedNotes, ...recentlyDeleted].find(x => x.id === id);
  if (!n) return;
  n.pinned = !n.pinned;
  saveData();
  renderNotes();
}

/* -------------------------------------------------------------
   11. Archive / Deleted Views
   ------------------------------------------------------------- */
function showAllNotes() {
  showingArchived = false;
  showingDeleted  = false;
  renderCategories(categorySearch.value);
  renderNotes();
}

function showArchived() {
  showingArchived = true;
  showingDeleted  = false;
  renderNotes();
}

function showDeleted() {
  showingDeleted  = true;
  showingArchived = false;
  renderNotes();
}

/* -------------------------------------------------------------
   12. Undo Delete
   ------------------------------------------------------------- */
function showUndoBtn() {
  undoBtn.style.display = "inline-block";
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoBtn.style.display = "none";
    lastDeleted = null;
  }, 8000);
}

function undoDelete() {
  if (!lastDeleted?.note) return;
  const { note, from } = lastDeleted;
  recentlyDeleted = recentlyDeleted.filter(n => n.id !== note.id);
  if (from === "notes")   notes.unshift(note);
  if (from === "archive") archivedNotes.unshift(note);
  lastDeleted = null;
  clearTimeout(undoTimer);
  undoBtn.style.display = "none";
  saveData();
  renderNotes();
}

/* -------------------------------------------------------------
   13. Import / Export
   ------------------------------------------------------------- */
function exportData() {
  const payload = { notes, archivedNotes, recentlyDeleted, categories, defaultCategoryColor, defaultNoteColor };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href:     url,
    download: `pen-to-text-export-${new Date().toISOString().slice(0,10)}.json`
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const obj = JSON.parse(e.target.result);
      if (!obj) throw new Error("Empty file.");

      const merge = (target, src, key) =>
        (src || []).forEach(n => { if (!target.some(x => x[key] === n[key])) target.push(n); });

      merge(notes,           obj.notes,           "id");
      merge(archivedNotes,   obj.archivedNotes,   "id");
      merge(recentlyDeleted, obj.recentlyDeleted,  "id");
      merge(categories,      obj.categories,       "name");

      saveData();
      renderCategories();
      renderNotes();
      alert("Import successful.");
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  };
  reader.readAsText(file);
}

/* -------------------------------------------------------------
   14. Speech Recognition
   ------------------------------------------------------------- */
function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  recognition = new SR();
  recognition.lang             = navigator.language || "en-US";
  recognition.interimResults   = false;
  recognition.maxAlternatives  = 1;

  recognition.onstart = () => {
    recognizing = true;
    voiceBtn.classList.add("listening");
    modalVoiceBtn.classList.add("listening");
  };

  recognition.onend = () => {
    recognizing = false;
    voiceBtn.classList.remove("listening");
    modalVoiceBtn.classList.remove("listening");
  };

  recognition.onerror = e => {
    recognizing = false;
    voiceBtn.classList.remove("listening");
    modalVoiceBtn.classList.remove("listening");
    console.warn("Speech error:", e.error);
  };

  recognition.onresult = event => {
    const transcript = [...event.results].map(r => r[0].transcript).join(" ");
    if (noteModal.style.display === "flex") {
      noteContentEl.value += (noteContentEl.value ? "\n" : "") + transcript;
    } else {
      noteContentEl.value += (noteContentEl.value ? "\n" : "") + transcript;
      renderModalCategories([]);
      openModal();
    }
  };
}

function toggleSpeech() {
  if (!recognition) { alert("Speech Recognition is not supported in this browser."); return; }
  if (recognizing) {
    recognition.stop();
  } else {
    try { recognition.start(); }
    catch { recognition.stop(); setTimeout(() => recognition.start(), 80); }
  }
}

/* -------------------------------------------------------------
   15. Modal Helpers
   ------------------------------------------------------------- */
function openModal() {
  noteModal.style.display = "flex";
  noteModal.setAttribute("aria-hidden", "false");
  modalTitle.textContent = isEditing ? "Edit Note" : "Add Note";
  setTimeout(() => noteTitleEl.focus(), 50);
}

function closeNoteModal() {
  noteModal.style.display = "none";
  noteModal.setAttribute("aria-hidden", "true");
  isEditing     = false;
  editingNoteId = null;
}

function openCustomizeModal() {
  defaultCategoryColorEl.value = defaultCategoryColor;
  defaultNoteColorEl.value     = defaultNoteColor;
  customizeModal.style.display = "flex";
  customizeModal.setAttribute("aria-hidden", "false");
}

function closeCustomizeModal() {
  customizeModal.style.display = "none";
  customizeModal.setAttribute("aria-hidden", "true");
}

/* -------------------------------------------------------------
   16. Settings / Customization
   ------------------------------------------------------------- */
function applyCustomization() {
  defaultCategoryColor = defaultCategoryColorEl.value || DEFAULTS.categoryColor;
  defaultNoteColor     = defaultNoteColorEl.value     || DEFAULTS.noteColor;
  saveData();
  renderCategories();
  renderNotes();
  closeCustomizeModal();
}

function resetAllData() {
  if (!confirm("Reset ALL app data? Notes, categories, and settings will be cleared.")) return;
  localStorage.clear();
  location.reload();
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) document.documentElement.removeAttribute("data-theme");
  else        document.documentElement.setAttribute("data-theme", "dark");
  saveData();
  renderNotes(); // re-render so noteBackground() picks up new theme
}

/* -------------------------------------------------------------
   17. Event Wiring
   ------------------------------------------------------------- */
function wireEvents() {
  /* Header */
  document.querySelector("header h1").addEventListener("click", showAllNotes);
  addNoteBtn.addEventListener("click", openNewNoteModal);
  voiceBtn.addEventListener("click", toggleSpeech);
  viewArchivedBtn.addEventListener("click", showArchived);
  viewDeletedBtn.addEventListener("click", showDeleted);
  undoBtn.addEventListener("click", undoDelete);
  themeToggle.addEventListener("click", toggleTheme);
  customizeBtn.addEventListener("click", openCustomizeModal);

  /* Search & sort */
  searchBar.addEventListener("input", debounce(renderNotes, 200));
  sortSelect.addEventListener("change", e => {
    currentSort = e.target.value;
    saveData();
    renderNotes();
  });

  /* Sidebar — category add */
  addCategoryBtn.addEventListener("click", addCategory);
  newCategoryInput.addEventListener("keydown", e => { if (e.key === "Enter") addCategory(); });
  categorySearch.addEventListener("input", () => renderCategories(categorySearch.value));

  /* Note modal */
  closeModal.addEventListener("click", closeNoteModal);
  cancelBtn.addEventListener("click", closeNoteModal);
  saveNoteBtn.addEventListener("click", saveNote);
  modalVoiceBtn.addEventListener("click", toggleSpeech);
  noteModal.addEventListener("click", e => { if (e.target === noteModal) closeNoteModal(); });

  /* Customize modal */
  closeCustomize.addEventListener("click", closeCustomizeModal);
  applyCustomizationBtn.addEventListener("click", applyCustomization);
  resetDataBtn.addEventListener("click", resetAllData);
  customizeModal.addEventListener("click", e => { if (e.target === customizeModal) closeCustomizeModal(); });

  /* Keyboard shortcuts */
  document.addEventListener("keydown", e => {
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === "Escape") {
      if (noteModal.style.display      === "flex") closeNoteModal();
      if (customizeModal.style.display === "flex") closeCustomizeModal();
      const fcModal = document.getElementById("flashcardModal");
      if (fcModal && fcModal.style.display === "flex") closeFlashcardManager();
    }
    // Ctrl/Cmd + B — new note
    if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); openNewNoteModal(); }
    // Ctrl/Cmd + E — export
    if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); exportData(); }
    // Ctrl/Cmd + I — import
    if (mod && e.key.toLowerCase() === "i") {
      e.preventDefault();
      const input = Object.assign(document.createElement("input"),
        { type: "file", accept: ".json,application/json" });
      input.onchange = () => input.files?.[0] && importData(input.files[0]);
      input.click();
    }
    // Ctrl/Cmd + Z — undo (when banner visible)
    if (mod && e.key.toLowerCase() === "z" && undoBtn.style.display !== "none") {
      undoDelete();
    }
  });
}

function addCategory() {
  const name = newCategoryInput.value.trim();
  if (!name) return;
  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    alert("A category with that name already exists."); return;
  }
  categories.push({ name, color: categoryColorPicker.value || defaultCategoryColor });
  newCategoryInput.value = "";
  saveData();
  renderCategories();
}

/* -------------------------------------------------------------
   18. Initialisation
   ------------------------------------------------------------- */
function init() {
  loadData();
  ensureAllNotesCategory();
  initSpeech();
  wireEvents();
  sortSelect.value = currentSort;
  renderCategories();
  renderNotes();
  autoPurge();
  setInterval(autoPurge, 60 * 60 * 1000); // hourly
}

init();

/* =============================================================
   FLASHCARD SYSTEM — Manual, per-note
   ============================================================= */

/* --- Storage helpers --- */
function getFlashcards(noteId) {
  try {
    return JSON.parse(localStorage.getItem("fc_" + noteId) || "[]");
  } catch { return []; }
}

function saveFlashcards(noteId, cards) {
  localStorage.setItem("fc_" + noteId, JSON.stringify(cards));
}

/* --- State --- */
let fcNoteId       = null;   // which note we're managing
let fcStudyCards   = [];     // shuffled deck for study mode
let fcStudyIndex   = 0;      // current card index
let fcStudyFlipped = false;  // is card flipped?

/* --- Open manager --- */
function openFlashcardManager(noteId) {
  fcNoteId = noteId;
  const note = notes.find(n => n.id === noteId);
  const modal = document.getElementById("flashcardModal");
  document.getElementById("fcNoteTitle").textContent =
    note?.title ? `Flashcards — ${note.title}` : "Flashcards";

  renderFlashcardList();
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
}

function closeFlashcardManager() {
  document.getElementById("flashcardModal").style.display = "none";
  fcNoteId = null;
}

/* --- Render card list --- */
function renderFlashcardList() {
  const cards   = getFlashcards(fcNoteId);
  const listEl  = document.getElementById("fcCardList");
  const emptyEl = document.getElementById("fcEmpty");
  const studyBtn = document.getElementById("fcStudyBtn");

  listEl.innerHTML = "";
  emptyEl.style.display = cards.length ? "none" : "block";
  studyBtn.disabled = cards.length === 0;

  cards.forEach((card, i) => {
    const item = document.createElement("div");
    item.className = "fc-list-item";

    const front = document.createElement("div");
    front.className = "fc-list-front";
    front.textContent = card.front || "(no front)";

    const back = document.createElement("div");
    back.className = "fc-list-back";
    back.textContent = card.back || "(no back)";

    const actions = document.createElement("div");
    actions.className = "fc-list-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "fc-edit-btn";
    editBtn.textContent = "✏️";
    editBtn.title = "Edit card";
    editBtn.addEventListener("click", () => openCardEditor(i));

    const delBtn = document.createElement("button");
    delBtn.className = "fc-del-btn";
    delBtn.textContent = "×";
    delBtn.title = "Delete card";
    delBtn.addEventListener("click", () => {
      if (!confirm("Delete this flashcard?")) return;
      const arr = getFlashcards(fcNoteId);
      arr.splice(i, 1);
      saveFlashcards(fcNoteId, arr);
      renderFlashcardList();
    });

    actions.append(editBtn, delBtn);
    item.append(front, back, actions);
    listEl.appendChild(item);
  });
}

/* --- Card editor (inline within manager) --- */
function openCardEditor(index) {
  const cards = getFlashcards(fcNoteId);
  const card  = index === -1 ? { front: "", back: "" } : cards[index];

  document.getElementById("fcEditorTitle").textContent =
    index === -1 ? "Add Flashcard" : "Edit Flashcard";
  document.getElementById("fcFrontInput").value = card.front || "";
  document.getElementById("fcBackInput").value  = card.back  || "";
  document.getElementById("fcEditorIndex").value = index;

  document.getElementById("fcManagerView").style.display = "none";
  document.getElementById("fcEditorView").style.display  = "flex";
  document.getElementById("fcFrontInput").focus();
}

function saveCardEdit() {
  const front = document.getElementById("fcFrontInput").value.trim();
  const back  = document.getElementById("fcBackInput").value.trim();
  if (!front && !back) { alert("Please enter a front or back for the card."); return; }

  const index = parseInt(document.getElementById("fcEditorIndex").value);
  const cards = getFlashcards(fcNoteId);

  if (index === -1) {
    cards.push({ front, back });
  } else {
    cards[index] = { front, back };
  }
  saveFlashcards(fcNoteId, cards);

  document.getElementById("fcManagerView").style.display = "flex";
  document.getElementById("fcEditorView").style.display  = "none";
  renderFlashcardList();
}

function cancelCardEdit() {
  document.getElementById("fcManagerView").style.display = "flex";
  document.getElementById("fcEditorView").style.display  = "none";
}

/* --- Study mode --- */
function openStudyMode() {
  const cards = getFlashcards(fcNoteId);
  if (!cards.length) return;

  // Shuffle
  fcStudyCards = [...cards].sort(() => Math.random() - 0.5);
  fcStudyIndex  = 0;
  fcStudyFlipped = false;

  document.getElementById("fcManagerView").style.display = "none";
  document.getElementById("fcEditorView").style.display  = "none";
  document.getElementById("fcStudyView").style.display   = "flex";

  renderStudyCard();
}

function renderStudyCard() {
  const card    = fcStudyCards[fcStudyIndex];
  const cardEl  = document.getElementById("fcStudyCard");
  const frontEl = document.getElementById("fcStudyFront");
  const backEl  = document.getElementById("fcStudyBack");
  const counter = document.getElementById("fcStudyCounter");
  const flipBtn = document.getElementById("fcFlipBtn");
  const nextBtn = document.getElementById("fcNextBtn");
  const prevBtn = document.getElementById("fcPrevBtn");

  fcStudyFlipped = false;
  cardEl.classList.remove("flipped");
  frontEl.textContent = card.front || "(no front)";
  backEl.textContent  = card.back  || "(no back)";
  counter.textContent = `${fcStudyIndex + 1} / ${fcStudyCards.length}`;
  flipBtn.textContent = "Flip Card";
  prevBtn.disabled = fcStudyIndex === 0;
  nextBtn.textContent = fcStudyIndex === fcStudyCards.length - 1 ? "Finish" : "Next →";
}

function flipStudyCard() {
  fcStudyFlipped = !fcStudyFlipped;
  document.getElementById("fcStudyCard").classList.toggle("flipped", fcStudyFlipped);
  document.getElementById("fcFlipBtn").textContent = fcStudyFlipped ? "Show Front" : "Flip Card";
}

function nextStudyCard() {
  if (fcStudyIndex === fcStudyCards.length - 1) {
    closeStudyMode();
  } else {
    fcStudyIndex++;
    renderStudyCard();
  }
}

function prevStudyCard() {
  if (fcStudyIndex > 0) { fcStudyIndex--; renderStudyCard(); }
}

function closeStudyMode() {
  document.getElementById("fcStudyView").style.display   = "none";
  document.getElementById("fcManagerView").style.display = "flex";
  renderFlashcardList();
}

/* Expose debug helper */
window._app = {
  get state() { return { notes, archivedNotes, recentlyDeleted, categories, currentCategory, currentSort }; },
  exportData,
  importData,
  resetAllData
};