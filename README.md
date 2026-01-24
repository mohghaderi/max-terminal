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

Projects (recommended)

If `projects.json` exists, the app will build the layout and content automatically from it (and merge with `content.json` as overrides). This avoids repeating the same blocks for each project.

Example `projects.json`:

```
{
  "globals": {
    "sshHost": "ubuntu@35.161.224.53",
    "sshKey": "F:/Companies/Xelead/IT/AmazonAWS/sunstarhost/ubuntu20webserver.pem",
    "shell": "C:/Program Files/Git/bin/bash.exe",
    "shellArgs": ["--login", "-i"]
  },
  "projects": [
    {
      "id": "mohghaderi",
      "title": "Mohghaderi.com",
      "repo": "github/mohghaderi/my-3d-website",
      "siteUrl": "http://35.161.224.53:9000/",
      "githubUrl": "https://github.com/mohghaderi/my-3d-website/pulls/"
    }
  ]
}
```
