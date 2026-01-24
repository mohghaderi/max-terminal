# Tabs

This directory contains configuration files for defining tabs in the application. Tabs are used to organize and group related content, such as different sections of a dashboard or different types of data visualization.

Each file in this directory represents a specific tab configuration, and the naming convention follows a standardized pattern to ensure consistency and ease of management. The configuration files are written in YAML format, which allows for clear and structured representation of tab properties and settings.

here is an example tab file content:

```json
{
  "tabTitle": "Example Web",
  "layout": {
    "type": "split",
    "direction": "row",
    "sizes": [0.6, 0.4],
    "children": [
      {
        "contentId": "website"
      },
      {
        "type": "tabs",
        "activeIndex": 0,
        "children": [
          {
            "contentId": "codex",
            "tabTitle": "Codex"
          },
          {
            "contentId": "dev_server",
            "tabTitle": "Run Dev"
          },
          {
            "contentId": "github",
            "tabTitle": "Github"
          },
          {
            "contentId": "bash",
            "tabTitle": "Bash"
          }
        ]
      }
    ]
  },
  "content": {
    "codex": {
      "type": "terminal",
      "title": "Codex",
      "shell": "C:/Program Files/Git/bin/bash.exe",
      "args": ["--login", "-i"],
      "initialCommands": [
        "cd github/mohghaderi/project_name",
        "codex"
      ]
    },
    "dev_server": {
      "type": "terminal",
      "title": "Dev Server",
      "shell": "C:/Program Files/Git/bin/bash.exe",
      "args": ["--login", "-i"],
      "initialCommands": [
        "cd github/mohghaderi/project_name",
        "npm run dev"
      ]
    },
    "bash": {
      "type": "terminal",
      "title": "Bash",
      "shell": "C:/Program Files/Git/bin/bash.exe",
      "args": ["--login", "-i"],
      "initialCommands": [
        "cd github/mohghaderi/project_name"
      ]
    },
    "website": {
      "type": "web",
      "title": "Website Server",
      "url": "http://www.example-app.com:9002/"
    },
    "website_local": {
      "type": "web",
      "title": "Website Local",
      "url": "http://localhost:9002/"
    },
    "github": {
      "type": "web",
      "title": "Github",
      "url": "https://github.com/mohghaderi/project_name/pulls/"
    }
  }
}

```