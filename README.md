# max-terminal

Electron + xterm.js + node-pty terminal layout with split panes defined by `layout.json` + `content.json`.

Quick start

1. Install dependencies: `npm install`
2. Start the app: `npm start`

Layout

The UI is driven by tab files under `tabs/` (or `conf/tabs/`) for structure and `content.json` for shared pane details. `layout.json` is no longer used. Layout supports nested splits and pane types:

- `split`: `{ "type": "split", "direction": "row" | "column", "sizes": [0.6, 0.4], "children": [...] }`
- `terminal`: `{ "contentId": "devTerminal" }`
- `web`: `{ "contentId": "docsWeb" }`

Content entries live in `content.json` keyed by `contentId`:

- `terminal`: `{ "type": "terminal", "title": "Git Bash", "shell": "cmd.exe", "args": [], "initialCommands": [] }`
- `web`: `{ "type": "web", "title": "Docs", "url": "https://example.com" }`

Tab files

Top-level tabs are loaded dynamically from the tab folder. Each tab file contains the layout node for that tab (usually a split/tabs layout) and an optional `tabTitle`.

Example `tabs/dev.json`:

```
{
  "type": "split",
  "tabTitle": "Dev",
  "direction": "row",
  "sizes": [0.6, 0.4],
  "children": [
    { "contentId": "devTerminal" },
    {
      "type": "tabs",
      "activeIndex": 0,
      "children": [
        { "contentId": "runTerminal", "tabTitle": "Run" },
        { "contentId": "localWeb", "tabTitle": "Web" }
      ]
    }
  ]
}
```

Tab files can also carry a `content` section (or use a `layout` wrapper) so each tab keeps its pane definitions close to its layout. Content from tab files is merged with `content.json` at runtime. If a tab filename starts with `_`, it is ignored.
