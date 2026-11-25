# Smart Folder (智能目录)

A lightweight SiYuan (`3.8+`) plugin that distinguishes 0-character pure folder nodes from content-bearing parent documents:

1. **Smart Click**: Single-clicking a 0-char pure folder toggles expand/collapse instead of opening a blank tab (double-click or `Alt/Option + Click` opens it; parent docs with content still open on single-click).
2. **Visual Folder Icons**: Distinct filled open/closed folder icons for 0-char folders vs content-bearing parent docs (custom user emojis are preserved).
3. **Directory Overview Cards**: Automatically renders interactive subfolder & child-note cards when viewing an empty folder page, without mutating `.sy` block data.
