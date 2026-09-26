(function () {
  "use strict";

  var NOTES_KEY = "mark.notes.v1";
  var THEME_KEY = "mark.theme.v1";
  var SAVE_DELAY = 420;
  var COLORS = ["#2c8878", "#d58a3a", "#6d72c6", "#b45d72", "#668f4f"];

  var elements = {
    appShell: document.querySelector("[data-testid='app-shell']"),
    noteList: document.getElementById("noteList"),
    noteCount: document.getElementById("noteCount"),
    searchInput: document.getElementById("searchInput"),
    searchClear: document.getElementById("searchClear"),
    newNoteButton: document.getElementById("newNoteButton"),
    emptyNewNoteButton: document.getElementById("emptyNewNoteButton"),
    filterButtons: Array.prototype.slice.call(document.querySelectorAll("[data-filter]")),
    themeButton: document.getElementById("themeButton"),
    titleInput: document.getElementById("titleInput"),
    contentInput: document.getElementById("contentInput"),
    editor: document.getElementById("editor"),
    emptyEditor: document.getElementById("emptyEditor"),
    favoriteButton: document.getElementById("favoriteButton"),
    deleteButton: document.getElementById("deleteButton"),
    mobileBackButton: document.getElementById("mobileBackButton"),
    breadcrumb: document.getElementById("breadcrumb"),
    metaChip: document.getElementById("metaChip"),
    metaChipText: document.getElementById("metaChipText"),
    lastEdited: document.getElementById("lastEdited"),
    saveState: document.getElementById("saveState"),
    wordCount: document.getElementById("wordCount"),
    deleteModal: document.getElementById("deleteModal"),
    deleteNoteName: document.getElementById("deleteNoteName"),
    cancelDeleteButton: document.getElementById("cancelDeleteButton"),
    confirmDeleteButton: document.getElementById("confirmDeleteButton"),
    toast: document.getElementById("toast"),
    toastText: document.getElementById("toastText")
  };

  var state = {
    notes: [],
    selectedId: null,
    filter: "all",
    query: "",
    saveTimer: null,
    toastTimer: null,
    pendingDeleteId: null
  };

  function uid() {
    return "note-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function createNote(overrides) {
    var values = overrides || {};
    var now = new Date().toISOString();
    return {
      id: values.id || uid(),
      title: typeof values.title === "string" ? values.title : "",
      content: typeof values.content === "string" ? values.content : "",
      favorite: Boolean(values.favorite),
      color: values.color || COLORS[Math.floor(Math.random() * COLORS.length)],
      createdAt: values.createdAt || now,
      updatedAt: values.updatedAt || now
    };
  }

  function seedNotes() {
    var now = Date.now();
    return [
      createNote({
        title: "欢迎使用马克笔记",
        content: "这是一款安静、轻量的本地笔记工具。\n\n左侧管理笔记，右侧专注书写。所有内容都会自动保存在当前浏览器中，无需登录，也不会上传到服务器。\n\n试试 Ctrl + N 新建笔记，或使用上方搜索框快速查找内容。",
        favorite: true,
        color: COLORS[0],
        createdAt: new Date(now - 1000 * 60 * 23).toISOString(),
        updatedAt: new Date(now - 1000 * 60 * 5).toISOString()
      }),
      createNote({
        title: "产品灵感",
        content: "把复杂的事情做简单。\n\n1. 先明确用户真正要解决的问题\n2. 用最小成本验证关键假设\n3. 让反馈进入下一轮迭代\n\n好的产品不是功能堆砌，而是恰到好处的秩序。",
        color: COLORS[1],
        createdAt: new Date(now - 1000 * 60 * 60 * 28).toISOString(),
        updatedAt: new Date(now - 1000 * 60 * 60 * 3).toISOString()
      }),
      createNote({
        title: "周末计划",
        content: "上午：去公园散步，顺便买一束花。\n下午：整理书架，读 50 页书。\n晚上：做一顿简单的晚餐，写下这一周的三个小收获。",
        color: COLORS[4],
        createdAt: new Date(now - 1000 * 60 * 60 * 50).toISOString(),
        updatedAt: new Date(now - 1000 * 60 * 60 * 21).toISOString()
      })
    ];
  }

  function normalizeNote(note, index) {
    var safe = note && typeof note === "object" ? note : {};
    var now = new Date().toISOString();
    return {
      id: typeof safe.id === "string" && safe.id ? safe.id : uid(),
      title: typeof safe.title === "string" ? safe.title.slice(0, 100) : "",
      content: typeof safe.content === "string" ? safe.content.slice(0, 20000) : "",
      favorite: Boolean(safe.favorite),
      color: typeof safe.color === "string" ? safe.color : COLORS[index % COLORS.length],
      createdAt: typeof safe.createdAt === "string" ? safe.createdAt : now,
      updatedAt: typeof safe.updatedAt === "string" ? safe.updatedAt : now
    };
  }

  function loadSavedState() {
    try {
      var raw = localStorage.getItem(NOTES_KEY);
      if (raw === null) {
        var seeded = seedNotes();
        return { notes: seeded, selectedId: seeded[0].id, filter: "all" };
      }
      var parsed = JSON.parse(raw);
      var notes = Array.isArray(parsed.notes) ? parsed.notes.map(normalizeNote) : [];
      var selectedId = notes.some(function (note) { return note.id === parsed.selectedId; })
        ? parsed.selectedId : (notes[0] ? notes[0].id : null);
      return {
        notes: notes,
        selectedId: selectedId,
        filter: parsed.filter === "favorites" ? "favorites" : "all"
      };
    } catch (error) {
      var fallback = seedNotes();
      return { notes: fallback, selectedId: fallback[0].id, filter: "all" };
    }
  }

  function persistNow() {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify({
        notes: state.notes,
        selectedId: state.selectedId,
        filter: state.filter
      }));
      elements.saveState.dataset.saving = "false";
      elements.saveState.textContent = "所有更改已保存";
      return true;
    } catch (error) {
      elements.saveState.dataset.saving = "false";
      elements.saveState.textContent = "本地保存失败";
      showToast("浏览器存储空间不足，暂时无法保存");
      return false;
    }
  }

  function schedulePersist() {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    elements.saveState.dataset.saving = "true";
    elements.saveState.textContent = "正在自动保存…";
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      persistNow();
    }, SAVE_DELAY);
  }

  function getSelectedNote() {
    return state.notes.find(function (note) { return note.id === state.selectedId; }) || null;
  }

  function getVisibleNotes() {
    var query = state.query.trim().toLocaleLowerCase("zh-CN");
    return state.notes.filter(function (note) {
      if (state.filter === "favorites" && !note.favorite) return false;
      if (!query) return true;
      return (note.title + "\n" + note.content).toLocaleLowerCase("zh-CN").indexOf(query) !== -1;
    }).sort(function (a, b) {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  function displayTitle(note) {
    return note && note.title.trim() ? note.title.trim() : "无标题笔记";
  }

  function compactText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function charCount(text) {
    return compactText(text).replace(/\s/g, "").length;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatRelative(iso) {
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    var now = new Date();
    var diff = now.getTime() - date.getTime();
    if (diff >= 0 && diff < 45 * 1000) return "刚刚";
    if (diff >= 0 && diff < 60 * 60 * 1000) return Math.max(1, Math.floor(diff / 60000)) + " 分钟前";
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    if (dateStart === todayStart) return pad(date.getHours()) + ":" + pad(date.getMinutes());
    if (dateStart === todayStart - 86400000) return "昨天";
    if (date.getFullYear() === now.getFullYear()) return (date.getMonth() + 1) + "月" + date.getDate() + "日";
    return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日";
  }

  function formatFullDate(iso) {
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "未知时间";
    return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日 " +
      pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function makeElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (typeof text === "string") element.textContent = text;
    return element;
  }

  function starIcon() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z");
    svg.appendChild(path);
    return svg;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function renderList() {
    var visibleNotes = getVisibleNotes();
    var total = state.notes.length;
    elements.noteList.textContent = "";
    elements.noteCount.textContent = state.query.trim() || state.filter === "favorites"
      ? visibleNotes.length + " / " + total + " 篇" : total + " 篇";

    elements.filterButtons.forEach(function (button) {
      var active = button.dataset.filter === state.filter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    if (!visibleNotes.length) {
      var empty = makeElement("div", "list-empty");
      var emptyTitle = state.query.trim() ? "没有找到匹配的笔记" : "还没有收藏笔记";
      var emptyText = state.query.trim() ? "换个关键词，或清除搜索条件试试。" : "点击笔记顶部的星标，就能在这里快速找到它。";
      empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8 13h8"/></svg><div><strong></strong><p></p></div>';
      empty.querySelector("strong").textContent = emptyTitle;
      empty.querySelector("p").textContent = emptyText;
      elements.noteList.appendChild(empty);
      return;
    }

    var fragment = document.createDocumentFragment();
    visibleNotes.forEach(function (note) {
      var card = makeElement("article", "note-card");
      card.dataset.noteId = note.id;
      card.dataset.testid = "note-card";
      card.setAttribute("role", "option");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-selected", String(note.id === state.selectedId));
      card.style.setProperty("--note-color", note.color);
      card.title = "打开：" + displayTitle(note);
      if (note.id === state.selectedId) card.classList.add("selected");

      var top = makeElement("div", "note-card-top");
      var title = makeElement("h2", "note-card-title", displayTitle(note));
      var time = makeElement("time", "note-card-time", formatRelative(note.updatedAt));
      time.dateTime = note.updatedAt;
      time.title = formatFullDate(note.updatedAt);
      top.appendChild(title);
      top.appendChild(time);

      var preview = makeElement("p", "note-card-preview", compactText(note.content) || "开始输入正文…");
      var footer = makeElement("div", "note-card-footer");
      var label = makeElement("span", "note-card-label");
      if (note.favorite) {
        label.appendChild(starIcon());
        label.appendChild(document.createTextNode("收藏"));
      } else {
        label.textContent = "笔记";
      }
      var words = makeElement("span", "note-card-words", charCount(note.content) + " 字");
      footer.appendChild(label);
      footer.appendChild(words);
      card.appendChild(top);
      card.appendChild(preview);
      card.appendChild(footer);
      fragment.appendChild(card);
    });
    elements.noteList.appendChild(fragment);
  }

  function renderEditor() {
    var note = getSelectedNote();
    var hasNote = Boolean(note);
    elements.editor.hidden = !hasNote;
    elements.emptyEditor.hidden = hasNote;
    elements.favoriteButton.disabled = !hasNote;
    elements.deleteButton.disabled = !hasNote;

    if (!note) {
      elements.breadcrumb.textContent = "所有笔记 / 未选择";
      elements.saveState.dataset.saving = "false";
      elements.saveState.textContent = "等待创建笔记";
      elements.wordCount.textContent = "0 字";
      document.title = "马克笔记 · 本地笔记";
      return;
    }

    elements.titleInput.value = note.title;
    elements.contentInput.value = note.content;
    elements.favoriteButton.setAttribute("aria-pressed", String(note.favorite));
    elements.favoriteButton.setAttribute("aria-label", note.favorite ? "取消收藏当前笔记" : "收藏当前笔记");
    elements.favoriteButton.querySelector("span").textContent = note.favorite ? "已收藏" : "收藏";
    elements.breadcrumb.innerHTML = "所有笔记 <span class=\"breadcrumb-separator\">/</span> " + escapeHtml(displayTitle(note));
    elements.metaChipText.textContent = note.favorite ? "收藏笔记" : "普通笔记";
    elements.lastEdited.textContent = "编辑于 " + formatRelative(note.updatedAt);
    elements.lastEdited.title = formatFullDate(note.updatedAt);
    elements.wordCount.textContent = charCount(note.content) + " 字";
    elements.saveState.dataset.saving = "false";
    elements.saveState.textContent = "所有更改已保存";
    document.title = displayTitle(note) + " · 马克笔记";
    autosizeContent();
  }

  function syncEditorMeta() {
    var note = getSelectedNote();
    if (!note) return;
    elements.lastEdited.textContent = "编辑于 " + formatRelative(note.updatedAt);
    elements.lastEdited.title = formatFullDate(note.updatedAt);
    elements.wordCount.textContent = charCount(note.content) + " 字";
    elements.breadcrumb.innerHTML = "所有笔记 <span class=\"breadcrumb-separator\">/</span> " + escapeHtml(displayTitle(note));
    document.title = displayTitle(note) + " · 马克笔记";
  }

  function renderAll() {
    renderList();
    renderEditor();
  }

  function autosizeContent() {
    elements.contentInput.style.height = "auto";
    elements.contentInput.style.height = Math.max(elements.contentInput.scrollHeight, Math.round(window.innerHeight * 0.54)) + "px";
  }

  function selectNote(id) {
    if (!state.notes.some(function (note) { return note.id === id; })) return;
    state.selectedId = id;
    document.body.classList.add("mobile-editor-open");
    renderAll();
    persistNow();
  }

  function createNewNote() {
    var note = createNote();
    state.notes.push(note);
    state.selectedId = note.id;
    state.query = "";
    elements.searchInput.value = "";
    elements.searchClear.classList.remove("visible");
    if (state.filter === "favorites") state.filter = "all";
    document.body.classList.add("mobile-editor-open");
    renderAll();
    persistNow();
    requestAnimationFrame(function () { elements.titleInput.focus(); });
    return note;
  }

  function touchNote(note) {
    note.updatedAt = new Date().toISOString();
  }

  function handleTitleInput() {
    var note = getSelectedNote();
    if (!note) return;
    note.title = elements.titleInput.value.slice(0, 100);
    touchNote(note);
    renderList();
    syncEditorMeta();
    schedulePersist();
  }

  function handleContentInput() {
    var note = getSelectedNote();
    if (!note) return;
    note.content = elements.contentInput.value.slice(0, 20000);
    touchNote(note);
    renderList();
    syncEditorMeta();
    autosizeContent();
    schedulePersist();
  }

  function toggleFavorite() {
    var note = getSelectedNote();
    if (!note) return;
    note.favorite = !note.favorite;
    touchNote(note);
    renderList();
    renderEditor();
    persistNow();
    showToast(note.favorite ? "已加入收藏" : "已取消收藏");
  }

  function openDeleteModal() {
    var note = getSelectedNote();
    if (!note) return;
    state.pendingDeleteId = note.id;
    elements.deleteNoteName.textContent = displayTitle(note);
    elements.deleteModal.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(function () { elements.cancelDeleteButton.focus(); });
  }

  function closeDeleteModal() {
    state.pendingDeleteId = null;
    elements.deleteModal.hidden = true;
    document.body.classList.remove("modal-open");
    elements.deleteButton.focus();
  }

  function confirmDelete() {
    var id = state.pendingDeleteId;
    if (!id) return;
    var deleted = state.notes.find(function (note) { return note.id === id; });
    state.notes = state.notes.filter(function (note) { return note.id !== id; });
    state.pendingDeleteId = null;
    elements.deleteModal.hidden = true;
    document.body.classList.remove("modal-open");

    if (state.selectedId === id) {
      var next = getVisibleNotes()[0] || state.notes.slice().sort(function (a, b) {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })[0] || null;
      state.selectedId = next ? next.id : null;
    }
    renderAll();
    persistNow();
    showToast(deleted ? "已删除“" + displayTitle(deleted) + "”" : "笔记已删除");
  }

  function handleSearchInput() {
    state.query = elements.searchInput.value;
    elements.searchClear.classList.toggle("visible", Boolean(state.query));
    renderList();
  }

  function clearSearch() {
    state.query = "";
    elements.searchInput.value = "";
    elements.searchClear.classList.remove("visible");
    renderList();
    elements.searchInput.focus();
  }

  function setFilter(filter) {
    if (filter !== "all" && filter !== "favorites") return;
    state.filter = filter;
    renderList();
    persistNow();
  }

  function showToast(message) {
    elements.toastText.textContent = message;
    elements.toast.classList.add("visible");
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      elements.toast.classList.remove("visible");
      state.toastTimer = null;
    }, 2200);
  }

  function toggleTheme() {
    var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (error) {}
    elements.themeButton.setAttribute("aria-label", next === "dark" ? "切换到浅色模式" : "切换到深色模式");
    document.querySelector("meta[name='theme-color']").setAttribute("content", next === "dark" ? "#101715" : "#f4f1ea");
  }

  elements.noteList.addEventListener("click", function (event) {
    var card = event.target.closest("[data-note-id]");
    if (card) selectNote(card.dataset.noteId);
  });

  elements.noteList.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var card = event.target.closest("[data-note-id]");
    if (card) {
      event.preventDefault();
      selectNote(card.dataset.noteId);
    }
  });

  elements.newNoteButton.addEventListener("click", createNewNote);
  elements.emptyNewNoteButton.addEventListener("click", createNewNote);
  elements.titleInput.addEventListener("input", handleTitleInput);
  elements.contentInput.addEventListener("input", handleContentInput);
  elements.searchInput.addEventListener("input", handleSearchInput);
  elements.searchClear.addEventListener("click", clearSearch);
  elements.favoriteButton.addEventListener("click", toggleFavorite);
  elements.deleteButton.addEventListener("click", openDeleteModal);
  elements.cancelDeleteButton.addEventListener("click", closeDeleteModal);
  elements.confirmDeleteButton.addEventListener("click", confirmDelete);
  elements.themeButton.addEventListener("click", toggleTheme);
  elements.mobileBackButton.addEventListener("click", function () {
    document.body.classList.remove("mobile-editor-open");
  });

  elements.filterButtons.forEach(function (button) {
    button.addEventListener("click", function () { setFilter(button.dataset.filter); });
  });

  elements.deleteModal.addEventListener("click", function (event) {
    if (event.target === elements.deleteModal) closeDeleteModal();
  });

  document.addEventListener("keydown", function (event) {
    var modifier = event.ctrlKey || event.metaKey;
    var key = event.key.toLocaleLowerCase();
    if (modifier && key === "n") {
      event.preventDefault();
      createNewNote();
      return;
    }
    if (modifier && key === "f") {
      event.preventDefault();
      elements.searchInput.focus();
      elements.searchInput.select();
      return;
    }
    if (modifier && key === "s") {
      event.preventDefault();
      persistNow();
      showToast("笔记已保存");
      return;
    }
    if (event.key === "Escape") {
      if (!elements.deleteModal.hidden) {
        closeDeleteModal();
      } else if (document.activeElement === elements.searchInput && state.query) {
        clearSearch();
      }
    }
  });

  window.addEventListener("resize", autosizeContent);
  window.addEventListener("beforeunload", persistNow);

  var loaded = loadSavedState();
  state.notes = loaded.notes;
  state.selectedId = loaded.selectedId;
  state.filter = loaded.filter;
  elements.themeButton.setAttribute(
    "aria-label",
    document.documentElement.dataset.theme === "dark" ? "切换到浅色模式" : "切换到深色模式"
  );
  renderAll();
  persistNow();

  window.MarkNotes = {
    state: state,
    createNote: createNewNote,
    selectNote: selectNote,
    persistNow: persistNow,
    getVisibleNotes: getVisibleNotes,
    storageKey: NOTES_KEY,
    isStarted: function () { return true; }
  };
})();
