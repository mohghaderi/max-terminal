# max-terminal

Electron + xterm.js + node-pty terminal layout with split panes defined by `layout.json` + `content.json`.

Quick start

1. Install dependencies: `npm install`
2. Start the app: `npm start`

Layout

The UI is driven by `layout.json` for structure and `content.json` for pane-specific details. Layout supports nested splits and pane types:

- `split`: `{ "type": "split", "direction": "row" | "column", "sizes": [0.6, 0.4], "children": [...] }`
- `terminal`: `{ "contentId": "devTerminal" }`
- `web`: `{ "contentId": "docsWeb" }`

Content entries live in `content.json` keyed by `contentId`:

- `terminal`: `{ "type": "terminal", "title": "Git Bash", "shell": "cmd.exe", "args": [], "initialCommands": [] }`
- `web`: `{ "type": "web", "title": "Docs", "url": "https://example.com" }`
