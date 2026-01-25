const fs = require('fs/promises');
const path = require('path');
const { app } = require('electron');

async function loadContent() {
  const candidates = resolveConfigPaths('content.json');

  let contentById = {};
  for (const contentPath of candidates) {
    try {
      const contentRaw = await fs.readFile(contentPath, 'utf8');
      const parsed = JSON.parse(contentRaw);
      contentById = { ...contentById, ...extractContentEntries(parsed) };
    } catch (err) {
      // try next location
    }
  }

  return contentById;
}

async function loadLayout() {
  const tabFiles = await loadTabFiles();
  console.log('[layout] loading tabs from:', tabFiles);
  const tabChildren = [];

  for (const tabFile of tabFiles) {
    try {
      const tabRaw = await fs.readFile(tabFile, 'utf8');
      const tabNode = JSON.parse(tabRaw);
      const fallbackTitle = path.parse(tabFile).name;
      const normalized = normalizeTabNode(tabNode, fallbackTitle);
      if (normalized) {
        const tabContent = extractContentEntries(tabNode?.content);
        if (tabContent && Object.keys(tabContent).length > 0) {
          normalized.__tabContent = tabContent;
        }
        tabChildren.push(normalized);
      }
    } catch (err) {
      console.warn(`Failed to load tab file: ${tabFile}`);
    }
  }

  return {
    type: 'tabs',
    activeIndex: 0,
    children: tabChildren,
    noTabs: tabChildren.length === 0
  };
}

async function loadTabFiles() {
  const tabFolders = resolveTabFolders();
  const collected = [];

  for (const folder of tabFolders) {
    try {
      const entries = await fs.readdir(folder, { withFileTypes: true });
      const tabFiles = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => name.endsWith('.json'))
        .filter((name) => !name.startsWith('_'))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => path.join(folder, name));

      collected.push(...tabFiles);
    } catch (err) {
      // try next location
    }
  }

  const unique = Array.from(new Set(collected)).sort((a, b) => a.localeCompare(b));
  if (unique.length === 0) {
    console.warn('No tab files found. Checked:', tabFolders);
  }
  return unique;
}

function resolveConfigPaths(...suffixes) {
  const appPath = app.getAppPath();
  const appParent = path.dirname(appPath);
  const cwd = process.cwd();
  const bases = [appPath, appParent, cwd];

  const results = [];
  for (const base of bases) {
    for (const suffix of suffixes) {
      results.push(path.join(base, suffix));
    }
  }

  return Array.from(new Set(results));
}

function resolveTabFolders() {
  const appPath = app.getAppPath();
  const appParent = path.dirname(appPath);
  const cwd = process.cwd();
  const codeRoot = path.join(__dirname, '..');

  const bases = [appPath, appParent, cwd, codeRoot];
  const suffixes = [path.join('conf', 'tabs'), 'tabs'];

  const results = [];
  for (const base of bases) {
    for (const suffix of suffixes) {
      results.push(path.join(base, suffix));
    }
  }

  return Array.from(new Set(results));
}

function extractContentEntries(raw) {
  if (!raw || typeof raw !== 'object') return {};
  if (raw.content && typeof raw.content === 'object' && !Array.isArray(raw.content)) {
    return { ...raw.content };
  }
  return { ...raw };
}

function normalizeTabNode(tabNode, fallbackTitle) {
  if (!tabNode || typeof tabNode !== 'object') return null;

  if (tabNode.layout && typeof tabNode.layout === 'object') {
    return {
      ...tabNode.layout,
      tabTitle: tabNode.tabTitle || fallbackTitle
    };
  }

  return {
    ...tabNode,
    tabTitle: tabNode.tabTitle || fallbackTitle
  };
}

function mergeLayoutWithContent(node, contentById, context) {
  if (!node || typeof node !== 'object') return node;

  const baseContent = contentById || {};
  const activeContent = context?.activeContent || baseContent;
  const overrides = node.__tabContent;
  const hasOverrides = overrides && typeof overrides === 'object' && Object.keys(overrides).length > 0;
  const nextActiveContent = hasOverrides ? { ...baseContent, ...overrides } : activeContent;

  const sanitized = { ...node };
  delete sanitized.__tabContent;

  const childContext = { activeContent: nextActiveContent };

  if (sanitized.type === 'split') {
    return {
      ...sanitized,
      children: Array.isArray(sanitized.children)
        ? sanitized.children.map((child) => mergeLayoutWithContent(child, contentById, childContext))
        : []
    };
  }

  if (sanitized.type === 'tabs') {
    return {
      ...sanitized,
      children: Array.isArray(sanitized.children)
        ? sanitized.children.map((child) => mergeLayoutWithContent(child, contentById, childContext))
        : []
    };
  }

  if (sanitized.contentId && nextActiveContent[sanitized.contentId]) {
    return {
      ...sanitized,
      ...nextActiveContent[sanitized.contentId]
    };
  }

  return sanitized;
}

module.exports = {
  loadContent,
  loadLayout,
  loadTabFiles,
  resolveConfigPaths,
  resolveTabFolders,
  mergeLayoutWithContent
};
