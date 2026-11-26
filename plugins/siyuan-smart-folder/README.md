# Smart Folder (智能目录)

A lightweight SiYuan (`3.8+`) plugin that distinguishes 0-character pure folder nodes from content-bearing parent documents:

1. **Unified Folder Click**: Single-clicking any parent folder toggles expand/collapse with zero delay; double-clicking (or `Alt/Option + Click`) opens the folder document itself.
2. **Visual Folder Icons**: Distinct filled open/closed folder icons for 0-char folders vs content-bearing parent docs (custom user emojis are preserved).
3. **Directory Overview Cards**: Automatically renders interactive subfolder & child-note cards when viewing an empty folder page, without mutating `.sy` block data.
4. **Right-Click Copy Path**: Adds a top-level **Copy Path** item to the document tree (single/multi-select & notebooks) and editor menus — single-click copies `Notebook/hpath`, while its submenu offers `Readable Path + Doc ID` (ideal for AI agents), `hpath` only, and underlying `.sy` data path.
