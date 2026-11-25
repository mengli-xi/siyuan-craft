"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const siyuan = require("siyuan");

const STORAGE_NAME = "config.json";

const DEFAULT_SETTINGS = {
  smartClick: true,
  folderIcon: true,
  overviewCard: true,
};

// Crisp SVGs for tree items & overview cards
const SVG_FOLDER_CLOSED = `<svg data-smart-folder-svg="closed" class="b3-list-item__graphic" viewBox="0 0 20 20" fill="currentColor"><path d="M2.75 4.5A1.75 1.75 0 0 1 4.5 2.75h3.38c.46 0 .9.18 1.23.51l1.13 1.13c.14.14.33.21.53.21h4.73a1.75 1.75 0 0 1 1.75 1.75v8.9a1.75 1.75 0 0 1-1.75 1.75H4.5a1.75 1.75 0 0 1-1.75-1.75V4.5Z"/></svg>`;

const SVG_FOLDER_OPEN = `<svg data-smart-folder-svg="open" class="b3-list-item__graphic" viewBox="0 0 20 20" fill="currentColor"><path d="M4.5 3A1.75 1.75 0 0 0 2.75 4.75v2.5h13.5v-.9A1.75 1.75 0 0 0 14.5 4.6h-4.73a.75.75 0 0 1-.53-.22L8.1 3.25A1.75 1.75 0 0 0 6.88 2.75H4.5ZM2.42 8.75a1 1 0 0 0-.96 1.27l1.48 5.25A1.75 1.75 0 0 0 4.62 16.5h10.76a1.75 1.75 0 0 0 1.68-1.23l1.48-5.25a1 1 0 0 0-.96-1.27H2.42Z"/></svg>`;

const SVG_DOC_DIR = `<svg data-smart-folder-svg="doc-dir" class="b3-list-item__graphic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.2A1.7 1.7 0 0 1 4.7 3.5h3.1l1.5 1.6h6A1.7 1.7 0 0 1 17 6.8v7.7a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 14.5V5.2Z"/><path d="M6.8 9.5h6.4M6.8 12.5h4.2"/></svg>`;

const SVG_CARD_DOC = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 2.75h6.25L15.5 6.5v10.75a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z"/><path d="M11.5 2.75V6.5h3.75M7.25 10.25h5.5M7.25 13.25h3.75"/></svg>`;

const SVG_DEFAULT_RESTORE = `<svg class="b3-list-item__graphic"><use xlink:href="#iconFolder"></use></svg>`;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatUpdatedDate(ts) {
  if (!ts || ts.length < 8) return "";
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

function formatCharLen(len) {
  const n = Number(len) || 0;
  if (n <= 0) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k 字符`;
  return `${n} 字符`;
}

class SmartFolderPlugin extends siyuan.Plugin {
  onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
    this.docMeta = new Map();
    this.indexLoaded = false;
    this.editingBypassIds = new Set();
    this.lastFolderClick = { id: "", ts: 0, wasExpanded: false };
    this.refreshTimer = null;
    this.rafPending = false;
    this.resizeObservers = new WeakMap();

    this.boundCaptureClick = this.onCaptureClick.bind(this);
    this.boundProtyleEvent = this.onProtyleEvent.bind(this);
    this.boundWsEvent = this.onWsEvent.bind(this);

    this.settingInputs = {};
    this.initSettingPanel();
    this.reloadSettingsAndIndex();

    document.addEventListener("click", this.boundCaptureClick, true);
    this.eventBus.on("loaded-protyle-static", this.boundProtyleEvent);
    this.eventBus.on("switch-protyle", this.boundProtyleEvent);
    this.eventBus.on("ws-main", this.boundWsEvent);
  }

  onDataChanged() {
    this.reloadSettingsAndIndex();
  }

  reloadSettingsAndIndex() {
    this.loadData(STORAGE_NAME).then((saved) => {
      if (saved && typeof saved === "object") {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
      }
      for (const k of Object.keys(this.settingInputs)) {
        if (this.settingInputs[k]) {
          this.settingInputs[k].checked = !!this.settings[k];
        }
      }
      if (!this.settings.folderIcon) {
        this.restoreAllTreeIcons();
      }
      this.refreshDocIndex();
    });
  }

  onLayoutReady() {
    this.startTreeObserver();
    this.refreshDocIndex();
  }

  onunload() {
    document.removeEventListener("click", this.boundCaptureClick, true);
    this.eventBus.off("loaded-protyle-static", this.boundProtyleEvent);
    this.eventBus.off("switch-protyle", this.boundProtyleEvent);
    this.eventBus.off("ws-main", this.boundWsEvent);

    if (this.treeObserver) {
      this.treeObserver.disconnect();
      this.treeObserver = null;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.restoreAllTreeIcons();
    this.removeAllOverviews();
  }

  initSettingPanel() {
    if (!siyuan.Setting) return;
    this.setting = new siyuan.Setting({
      confirmCallback: () => {
        this.saveData(STORAGE_NAME, this.settings);
        if (!this.settings.folderIcon) {
          this.restoreAllTreeIcons();
        } else {
          this.decorateAllTreeRows();
        }
        this.syncAllVisibleProtyles();
      },
    });

    const makeCheckbox = (key) => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "b3-switch fn__flex-center";
      input.checked = !!this.settings[key];
      input.addEventListener("change", () => {
        this.settings[key] = input.checked;
      });
      this.settingInputs[key] = input;
      return input;
    };

    this.setting.addItem({
      title: "智能单击空目录",
      description: "0 字纯目录单击仅展开/折叠子文档（双击或按住 Option/Alt 单击可打开目录页）；含正文的父文档仍正常单击打开。",
      createActionElement: () => makeCheckbox("smartClick"),
    });

    this.setting.addItem({
      title: "文档树专属文件夹图标",
      description: "自动为 0 字纯目录显示实心开合文件夹图标，并与含正文的父级文档区分（保留手动设置的自定义 Emoji）。",
      createActionElement: () => makeCheckbox("folderIcon"),
    });

    this.setting.addItem({
      title: "空目录页自动展示卡片概览",
      description: "通过双击或面包屑进入 0 字纯目录页时，自动渲染子目录与子笔记卡片列表（不改动底层 .sy 文档数据）。",
      createActionElement: () => makeCheckbox("overviewCard"),
    });
  }

  scheduleIndexRefresh(delayMs = 280) {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refreshDocIndex();
    }, delayMs);
  }

  onWsEvent(ev) {
    const cmd = ev && ev.detail && ev.detail.cmd;
    if (!cmd) return;
    if (
      cmd === "transactions" ||
      cmd === "create" ||
      cmd === "removeDoc" ||
      cmd === "rename" ||
      cmd === "moveDoc" ||
      cmd === "mount" ||
      cmd === "unmount"
    ) {
      this.scheduleIndexRefresh(320);
    }
  }

  refreshDocIndex() {
    const stmt = `
      SELECT d.id, d.box, d.path, d.hpath, d.content AS title, d.updated, d.sort,
             COALESCE(SUM(LENGTH(TRIM(c.markdown))), 0) AS md_len
      FROM blocks d
      LEFT JOIN blocks c ON c.root_id = d.id AND c.id != d.id
      WHERE d.type = 'd'
      GROUP BY d.id
      LIMIT 10000
    `;
    siyuan.fetchPost("/api/sql/sql", { stmt }, (res) => {
      if (!res || res.code !== 0 || !Array.isArray(res.data)) return;
      const map = new Map();
      for (const row of res.data) {
        const mdLen = Number(row.md_len || 0);
        map.set(row.id, {
          id: row.id,
          box: row.box || "",
          path: row.path || "",
          hpath: row.hpath || "",
          title: row.content || row.title || "未命名",
          updated: row.updated || "",
          sort: Number(row.sort || 0),
          mdLen,
          isEmpty: mdLen === 0,
          children: [],
          totalDescendants: 0,
        });
      }

      // Link parent -> direct children from storage ID path (/parentID/docID.sy)
      for (const meta of map.values()) {
        const clean = meta.path.replace(/^\//, "").replace(/\.sy$/, "");
        const parts = clean ? clean.split("/") : [];
        if (parts.length >= 2) {
          const parentId = parts[parts.length - 2];
          const parentMeta = map.get(parentId);
          if (parentMeta) {
            parentMeta.children.push(meta.id);
          }
          // Count total descendants up the ancestor chain
          for (let i = 0; i < parts.length - 1; i++) {
            const anc = map.get(parts[i]);
            if (anc) anc.totalDescendants += 1;
          }
        }
        // If a previously empty folder now has content, clear any manual edit bypass
        if (!meta.isEmpty && this.editingBypassIds.has(meta.id)) {
          this.editingBypassIds.delete(meta.id);
        }
      }

      // Sort direct children consistently
      for (const meta of map.values()) {
        if (meta.children.length > 1) {
          meta.children.sort((aId, bId) => {
            const a = map.get(aId);
            const b = map.get(bId);
            if (!a || !b) return 0;
            if (a.sort !== b.sort) return a.sort - b.sort;
            return a.title.localeCompare(b.title, "zh-CN", { numeric: true });
          });
        }
      }

      this.docMeta = map;
      this.indexLoaded = true;
      this.decorateAllTreeRows();
      this.syncAllVisibleProtyles();
    });
  }

  startTreeObserver() {
    if (this.treeObserver) this.treeObserver.disconnect();
    this.treeObserver = new MutationObserver((mutations) => {
      let relevant = false;
      for (const m of mutations) {
        if (m.type === "attributes") {
          const el = m.target;
          if (el && el.classList && el.classList.contains("b3-list-item__arrow")) {
            relevant = true;
            break;
          }
        } else if (m.type === "childList") {
          const t = m.target;
          if (
            t &&
            t.closest &&
            t.closest('.sy__file, [data-type="sidebar-file"], .file-tree__pins')
          ) {
            // Ignore mutations caused by our own SVG icon replacement
            if (t.classList && t.classList.contains("b3-list-item__icon")) continue;
            relevant = true;
            break;
          }
        }
      }
      if (relevant && !this.rafPending) {
        this.rafPending = true;
        requestAnimationFrame(() => {
          this.rafPending = false;
          this.decorateAllTreeRows();
        });
      }
    });

    this.treeObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  isRowExpanded(toggleEl) {
    if (!toggleEl) return false;
    const arrow = toggleEl.querySelector(".b3-list-item__arrow");
    return !!(arrow && arrow.classList.contains("b3-list-item__arrow--open"));
  }

  decorateAllTreeRows() {
    if (!this.indexLoaded) return;
    const rows = document.querySelectorAll(
      '.sy__file li[data-type="navigation-file"][data-node-id], [data-type="sidebar-file"] li[data-type="navigation-file"][data-node-id], .file-tree__pins li[data-type="navigation-file"][data-node-id]'
    );
    rows.forEach((li) => this.decorateTreeRow(li));
  }

  decorateTreeRow(li) {
    const docId = li.getAttribute("data-node-id");
    if (!docId) return;
    const toggleEl = li.querySelector(":scope > .b3-list-item__toggle");
    const hasToggle = !!(toggleEl && !toggleEl.classList.contains("fn__hidden"));
    const meta = this.docMeta.get(docId);
    const hasChildren = hasToggle || !!(meta && meta.children.length > 0);

    if (!this.settings.folderIcon || !hasChildren) {
      if (li.hasAttribute("data-smart-folder")) {
        li.removeAttribute("data-smart-folder");
        const iconSpan = li.querySelector(":scope > .b3-list-item__icon");
        if (iconSpan && iconSpan.querySelector("svg[data-smart-folder-svg]")) {
          iconSpan.innerHTML = `<svg class="b3-list-item__graphic"><use xlink:href="#${hasChildren ? "iconFolder" : "iconFile"}"></use></svg>`;
        }
      }
      return;
    }

    const isEmpty = meta ? meta.isEmpty : false;
    const expanded = this.isRowExpanded(toggleEl);
    const folderState = isEmpty ? (expanded ? "empty-dir-open" : "empty-dir") : "doc-dir";

    if (li.getAttribute("data-smart-folder") !== folderState) {
      li.setAttribute("data-smart-folder", folderState);
    }

    const iconSpan = li.querySelector(":scope > .b3-list-item__icon");
    if (!iconSpan) return;

    // Preserve user custom emoji (text node without svg) or custom img icon
    if (iconSpan.querySelector("img")) return;
    const existingSvg = iconSpan.querySelector("svg");
    if (!existingSvg) return;

    const desiredSvgType = isEmpty ? (expanded ? "open" : "closed") : "doc-dir";
    if (existingSvg.getAttribute("data-smart-folder-svg") === desiredSvgType) return;

    iconSpan.innerHTML =
      desiredSvgType === "open"
        ? SVG_FOLDER_OPEN
        : desiredSvgType === "closed"
        ? SVG_FOLDER_CLOSED
        : SVG_DOC_DIR;
  }

  restoreAllTreeIcons() {
    document
      .querySelectorAll("li.file-tree__row[data-smart-folder]")
      .forEach((li) => {
        li.removeAttribute("data-smart-folder");
        const iconSpan = li.querySelector(":scope > .b3-list-item__icon");
        if (iconSpan && iconSpan.querySelector("svg[data-smart-folder-svg]")) {
          iconSpan.innerHTML = SVG_DEFAULT_RESTORE;
        }
      });
  }

  onCaptureClick(e) {
    if (!this.settings.smartClick || !this.indexLoaded) return;
    if (!e.isTrusted || e.button !== 0) return;
    // Allow Option/Alt + Click (or Cmd/Ctrl/Shift) to bypass interception
    if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;

    const target = e.target;
    if (!(target instanceof Element)) return;

    // Ignore clicks on arrow toggle, icon picker, action buttons, or publish switch
    if (
      target.closest(
        ".b3-list-item__toggle, .b3-list-item__icon, .b3-list-item__action, .b3-list-item__switch"
      )
    ) {
      return;
    }

    const treeContainer = target.closest(
      '.sy__file, [data-type="sidebar-file"], .file-tree__pins'
    );
    if (!treeContainer) return;

    const li = target.closest('li[data-type="navigation-file"][data-node-id]');
    if (!li) return;

    const docId = li.getAttribute("data-node-id");
    if (!docId) return;

    const toggleEl = li.querySelector(":scope > .b3-list-item__toggle");
    const hasSubDocs = !!(toggleEl && !toggleEl.classList.contains("fn__hidden"));
    if (!hasSubDocs) return;

    const meta = this.docMeta.get(docId);
    // Only intercept 0-char pure folders; content-bearing parent docs open normally!
    if (!meta || !meta.isEmpty) return;

    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    const isDoubleClick =
      e.detail >= 2 ||
      (this.lastFolderClick.id === docId && now - this.lastFolderClick.ts < 340);

    if (isDoubleClick) {
      // Keep folder expanded if the preceding single-click just collapsed it
      const currentlyExpanded = this.isRowExpanded(toggleEl);
      if (this.lastFolderClick.wasExpanded && !currentlyExpanded) {
        toggleEl.click();
      }
      this.lastFolderClick = { id: "", ts: 0, wasExpanded: false };
      siyuan.openTab({
        app: this.app,
        doc: { id: docId },
      });
      return;
    }

    const wasExpanded = this.isRowExpanded(toggleEl);
    this.lastFolderClick = { id: docId, ts: now, wasExpanded };
    toggleEl.click();
  }

  onProtyleEvent(ev) {
    const protyle = ev && ev.detail && ev.detail.protyle;
    if (protyle && protyle.element) {
      const rootID = protyle.block && protyle.block.rootID;
      this.renderOverviewForProtyleEl(protyle.element, rootID);
    } else {
      this.syncAllVisibleProtyles();
    }
  }

  syncAllVisibleProtyles() {
    if (!this.indexLoaded) return;
    document.querySelectorAll(".protyle:not(.fn__none)").forEach((protyleEl) => {
      const titleEl = protyleEl.querySelector(".protyle-title[data-node-id]");
      const rootID = titleEl ? titleEl.getAttribute("data-node-id") : "";
      if (rootID) {
        this.renderOverviewForProtyleEl(protyleEl, rootID);
      }
    });
  }

  syncOverviewPadding(contentEl, wysiwygEl, overviewEl) {
    const titleEl = contentEl.querySelector(".protyle-title");
    const refEl = titleEl || wysiwygEl;
    if (!refEl || !overviewEl) return;
    const cs = window.getComputedStyle(refEl);
    const pl = refEl.style.paddingLeft || cs.paddingLeft || "96px";
    const pr = refEl.style.paddingRight || cs.paddingRight || "96px";
    // Note: .protyle-title uses marginLeft/marginRight in some SiYuan layouts
    const ml = titleEl ? titleEl.style.marginLeft || cs.marginLeft : "0px";
    const mr = titleEl ? titleEl.style.marginRight || cs.marginRight : "0px";
    if (parseFloat(ml) > 24) {
      overviewEl.style.paddingLeft = ml;
      overviewEl.style.paddingRight = mr;
    } else {
      overviewEl.style.paddingLeft = pl;
      overviewEl.style.paddingRight = pr;
    }
  }

  renderOverviewForProtyleEl(protyleEl, rootID) {
    const contentEl = protyleEl.querySelector(":scope > .protyle-content");
    const wysiwygEl = contentEl
      ? contentEl.querySelector(":scope > .protyle-wysiwyg")
      : null;
    if (!contentEl || !wysiwygEl) return;

    const existing = contentEl.querySelector(":scope > .smart-folder-overview");
    const meta = rootID ? this.docMeta.get(rootID) : null;

    const shouldShow =
      this.settings.overviewCard &&
      this.indexLoaded &&
      meta &&
      meta.isEmpty &&
      meta.children.length > 0 &&
      !this.editingBypassIds.has(rootID);

    if (!shouldShow) {
      if (existing) existing.remove();
      contentEl.classList.remove("smart-folder-hiding-wysiwyg");
      return;
    }

    contentEl.classList.add("smart-folder-hiding-wysiwyg");

    const childMetas = meta.children
      .map((id) => this.docMeta.get(id))
      .filter(Boolean);
    const subFolders = childMetas.filter((c) => c.children.length > 0);
    const subDocs = childMetas.filter((c) => c.children.length === 0);

    const sig = `${rootID}|${childMetas
      .map((c) => `${c.id}:${c.title}:${c.children.length}:${c.mdLen}:${c.updated}`)
      .join(",")}`;

    if (existing && existing.getAttribute("data-sig") === sig) {
      this.syncOverviewPadding(contentEl, wysiwygEl, existing);
      return;
    }

    const overviewEl = existing || document.createElement("div");
    overviewEl.className = "smart-folder-overview";
    overviewEl.setAttribute("data-for-root", rootID);
    overviewEl.setAttribute("data-sig", sig);

    const showSearch = childMetas.length >= 6;
    const summaryParts = [];
    if (subFolders.length > 0) summaryParts.push(`${subFolders.length} 个子目录`);
    if (subDocs.length > 0) summaryParts.push(`${subDocs.length} 篇文档`);
    if (meta.totalDescendants > childMetas.length) {
      summaryParts.push(`共含 ${meta.totalDescendants} 个下级条目`);
    }

    overviewEl.innerHTML = `
      <div class="smart-folder-overview__bar">
        <div class="smart-folder-overview__meta">
          <span class="smart-folder-overview__badge">纯目录视图</span>
          <span>${escapeHtml(summaryParts.join(" · "))}</span>
        </div>
        <div class="smart-folder-overview__actions">
          ${
            showSearch
              ? `<input type="search" class="smart-folder-overview__search" placeholder="筛选此目录条目..." />`
              : ""
          }
          <button type="button" class="smart-folder-overview__edit-btn" data-action="edit-folder">
            ✎ 编写目录正文
          </button>
        </div>
      </div>
      <div class="smart-folder-overview__body"></div>
    `;

    const bodyEl = overviewEl.querySelector(".smart-folder-overview__body");

    const renderBody = (keyword = "") => {
      const kw = keyword.trim().toLowerCase();
      const filteredFolders = kw
        ? subFolders.filter((f) => f.title.toLowerCase().includes(kw))
        : subFolders;
      const filteredDocs = kw
        ? subDocs.filter((d) => d.title.toLowerCase().includes(kw))
        : subDocs;

      if (filteredFolders.length === 0 && filteredDocs.length === 0) {
        bodyEl.innerHTML = `<div class="smart-folder-overview__empty-filter">没有匹配「${escapeHtml(
          keyword
        )}」的子条目</div>`;
        return;
      }

      let html = "";
      if (filteredFolders.length > 0) {
        html += `<div class="smart-folder-overview__section">
          <div class="smart-folder-overview__section-title">子目录 (${filteredFolders.length})</div>
          <div class="smart-folder-overview__grid">
            ${filteredFolders
              .map((f) => {
                const isDocDir = !f.isEmpty;
                const cls = isDocDir
                  ? "smart-folder-card--docdir"
                  : "smart-folder-card--folder";
                const icon = isDocDir ? SVG_DOC_DIR : SVG_FOLDER_CLOSED;
                return `
                  <div class="smart-folder-card ${cls}" data-open-id="${f.id}">
                    <div class="smart-folder-card__icon">${icon}</div>
                    <div class="smart-folder-card__body">
                      <div class="smart-folder-card__title" title="${escapeHtml(
                        f.title
                      )}">${escapeHtml(f.title)}</div>
                      <div class="smart-folder-card__sub">
                        <span>${f.children.length} 个直接子项</span>
                        ${
                          isDocDir
                            ? `<span class="smart-folder-card__pill">含正文</span>`
                            : ""
                        }
                      </div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>`;
      }

      if (filteredDocs.length > 0) {
        html += `<div class="smart-folder-overview__section">
          <div class="smart-folder-overview__section-title">文档 (${filteredDocs.length})</div>
          <div class="smart-folder-overview__list">
            ${filteredDocs
              .map((d) => {
                const dateStr = formatUpdatedDate(d.updated);
                const lenStr = formatCharLen(d.mdLen);
                const subItems = [dateStr, lenStr].filter(Boolean).join(" · ");
                return `
                  <div class="smart-folder-card smart-folder-card--doc" data-open-id="${d.id}">
                    <div class="smart-folder-card__icon">${SVG_CARD_DOC}</div>
                    <div class="smart-folder-card__body">
                      <div class="smart-folder-card__title" title="${escapeHtml(
                        d.title
                      )}">${escapeHtml(d.title)}</div>
                      <div class="smart-folder-card__sub">
                        <span>${escapeHtml(subItems || "空白文档")}</span>
                      </div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>`;
      }

      bodyEl.innerHTML = html;
    };

    renderBody("");

    // Wire events once per overviewEl creation/update
    overviewEl.onclick = (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const editBtn = target.closest('[data-action="edit-folder"]');
      if (editBtn) {
        this.editingBypassIds.add(rootID);
        overviewEl.remove();
        contentEl.classList.remove("smart-folder-hiding-wysiwyg");
        const firstEditable = wysiwygEl.querySelector('[contenteditable="true"]');
        if (firstEditable instanceof HTMLElement) {
          firstEditable.focus();
        }
        return;
      }

      const card = target.closest("[data-open-id]");
      if (card) {
        const targetId = card.getAttribute("data-open-id");
        if (targetId) {
          siyuan.openTab({
            app: this.app,
            doc: { id: targetId },
            keepCursor: e.metaKey || e.ctrlKey,
          });
        }
      }
    };

    const searchInput = overviewEl.querySelector(".smart-folder-overview__search");
    if (searchInput) {
      searchInput.oninput = () => renderBody(searchInput.value);
    }

    if (!existing) {
      contentEl.insertBefore(overviewEl, wysiwygEl);
    }
    this.syncOverviewPadding(contentEl, wysiwygEl, overviewEl);

    if (!this.resizeObservers.has(contentEl)) {
      const ro = new ResizeObserver(() => {
        const curOverview = contentEl.querySelector(":scope > .smart-folder-overview");
        if (curOverview) {
          this.syncOverviewPadding(contentEl, wysiwygEl, curOverview);
        }
      });
      ro.observe(contentEl);
      this.resizeObservers.set(contentEl, ro);
    }
  }

  removeAllOverviews() {
    document.querySelectorAll(".smart-folder-overview").forEach((el) => el.remove());
    document
      .querySelectorAll(".protyle-content.smart-folder-hiding-wysiwyg")
      .forEach((el) => el.classList.remove("smart-folder-hiding-wysiwyg"));
  }
}

exports.default = SmartFolderPlugin;
module.exports = exports;
