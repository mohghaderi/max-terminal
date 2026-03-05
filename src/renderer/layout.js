import { setupTerminalWhenVisible, checkDeferredTerminalSetup, handleResize, focusFirstTerminalInElement } from './terminal.js';
import {
  createWebview,
  loadWebviewUrl,
  createWebviewStatus,
  attachWebviewHandlers,
  clearWebviewStatus
} from './webview.js';

let paneCounter = 0;

function nextPaneId() {
  paneCounter += 1;
  return `pane-${paneCounter}`;
}

function normalizeSizes(count, sizes) {
  if (!Array.isArray(sizes) || sizes.length !== count) {
    return Array.from({ length: count }, () => 1);
  }
  const total = sizes.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return Array.from({ length: count }, () => 1);
  }
  return sizes.map((value) => value / total);
}

function buildSplit(node) {
  const container = document.createElement('div');
  container.className = `split ${node.direction === 'column' ? 'column' : 'row'}`;
  const sizes = normalizeSizes(node.children.length, node.sizes);
  container.dataset.split = 'true';
  container.dataset.splitDirection = node.direction === 'column' ? 'column' : 'row';
  container.dataset.splitSizes = JSON.stringify(sizes);

  node.children.forEach((child) => {
    const slot = document.createElement('div');
    slot.className = 'split-slot';
    slot.appendChild(buildNode(child));
    container.appendChild(slot);
  });

  return container;
}

function buildTabs(node) {
  const container = document.createElement('div');
  container.className = 'tabs';

  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';

  const tabContent = document.createElement('div');
  tabContent.className = 'tab-content';

  const children = Array.isArray(node.children) ? node.children : [];
  const panels = [];

  children.forEach((child, index) => {
    const tabButton = document.createElement('button');
    tabButton.type = 'button';
    tabButton.className = 'tab-button';
    tabButton.textContent = child.tabTitle || child.title || child.contentId || `Tab ${index + 1}`;
    tabBar.appendChild(tabButton);

    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.appendChild(buildNode(child));
    tabContent.appendChild(panel);

    panels.push({ tabButton, panel });
  });

  const defaultIndex = Number.isFinite(node.activeIndex) ? node.activeIndex : 0;
  const maxIndex = Math.max(0, panels.length - 1);
  const initialIndex = Math.min(Math.max(defaultIndex, 0), maxIndex);

  function setActiveTab(index) {
    panels.forEach((entry, panelIndex) => {
      const isActive = panelIndex === index;
      entry.tabButton.classList.toggle('active', isActive);
      entry.panel.classList.toggle('active', isActive);
    });
    checkDeferredTerminalSetup();
    handleResize();
  }

  panels.forEach((entry, index) => {
    entry.tabButton.addEventListener('click', () => {
      setActiveTab(index);
      entry.tabButton.blur();
      if (!focusFirstTerminalInElement(entry.panel)) {
        setTimeout(() => {
          focusFirstTerminalInElement(entry.panel);
        }, 0);
      }
    });
  });

  if (panels.length > 0) {
    setActiveTab(initialIndex);
  }

  container.appendChild(tabBar);
  container.appendChild(tabContent);
  return container;
}

function buildPane(node) {
  const paneId = nextPaneId();
  const pane = document.createElement('div');
  pane.className = 'pane';

  const titlebar = document.createElement('div');
  titlebar.className = 'titlebar';

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = node.title || 'Pane';

  const refresh = document.createElement('button');
  refresh.className = 'refresh';
  refresh.type = 'button';
  refresh.textContent = 'Refresh';

  titlebar.appendChild(title);
  titlebar.appendChild(refresh);

  const content = document.createElement('div');
  content.className = 'content';

  pane.appendChild(titlebar);
  pane.appendChild(content);

  refresh.addEventListener('click', () => {
    const activeTabPanel = refresh.closest('.tab-panel.active');
    const tabPanel = activeTabPanel || refresh.closest('.tab-panel');
    const focusScope = tabPanel || pane;

    refresh.blur();
    setTimeout(() => {
      focusFirstTerminalInElement(focusScope);
    }, 0);
  });

  if (node.type === 'terminal') {
    setupTerminalWhenVisible(content, refresh, node, paneId);
  }

  if (node.type === 'web') {
    const webview = createWebview(node);
    const status = createWebviewStatus(content, () => loadWebviewUrl(webview, webview.dataset.initialUrl));
    attachWebviewHandlers({ webview, status, node });
    content.appendChild(webview);
    loadWebviewUrl(webview, webview.dataset.initialUrl);
    refresh.addEventListener('click', async () => {
      clearWebviewStatus(status);
      if (node.contentId && window.maxTerminal.getContent) {
        try {
          const fresh = await window.maxTerminal.getContent(node.contentId);
          const nextUrl = fresh?.url || node.url;
          if (nextUrl) {
            loadWebviewUrl(webview, nextUrl);
          } else {
            loadWebviewUrl(webview, webview.dataset.initialUrl);
          }
          return;
        } catch (err) {
          // fall through to reload
        }
      }
      loadWebviewUrl(webview, webview.dataset.initialUrl);
    });
  }

  return pane;
}

export function buildNode(node) {
  if (node.type === 'split') {
    return buildSplit(node);
  }
  if (node.type === 'tabs') {
    return buildTabs(node);
  }

  return buildPane(node);
}
