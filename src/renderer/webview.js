export function createWebview(node) {
  const webview = document.createElement('webview');
  webview.className = 'webview';
  webview.setAttribute('allowpopups', '');
  webview.dataset.initialUrl = node.url || 'https://example.com';
  return webview;
}

export function loadWebviewUrl(webview, url) {
  if (!webview || !url) return;
  webview.dataset.lastRequestedUrl = url;
  if (webview.dataset.domReady !== 'true' || !webview.isConnected) {
    webview.src = url;
    return;
  }
  const loadPromise = webview.loadURL(url);
  if (loadPromise && typeof loadPromise.catch === 'function') {
    loadPromise.catch((err) => {
      const code = err?.code ?? err?.errno;
      if (code === 'ERR_ABORTED' || code === -3) {
        return;
      }
      console.error('Webview load failed', err);
    });
  }
}

export function createWebviewStatus(container, onReload) {
  const status = document.createElement('div');
  status.className = 'webview-status';
  status.hidden = true;

  const header = document.createElement('div');
  header.className = 'webview-status-header';

  const title = document.createElement('div');
  title.className = 'webview-status-title';
  title.textContent = 'Web view error';

  const close = document.createElement('button');
  close.className = 'webview-status-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close web view error');
  close.textContent = '×';
  close.addEventListener('click', () => {
    status.hidden = true;
    details.textContent = '';
    status.remove();
  });

  const details = document.createElement('div');
  details.className = 'webview-status-details';

  const actions = document.createElement('div');
  actions.className = 'webview-status-actions';

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Reload';
  retry.addEventListener('click', () => {
    status.hidden = true;
    onReload();
  });

  header.appendChild(title);
  header.appendChild(close);
  actions.appendChild(retry);
  status.appendChild(header);
  status.appendChild(details);
  status.appendChild(actions);
  container.appendChild(status);

  return { status, details, container };
}

function ensureWebviewStatusAttached(status) {
  if (!status.status.isConnected) {
    status.container.appendChild(status.status);
  }
}

export function clearWebviewStatus(status) {
  status.status.hidden = true;
  status.details.textContent = '';
  status.status.remove();
}

export function attachWebviewHandlers({ webview, status, node }) {
  const showStatus = (message, detail) => {
    ensureWebviewStatusAttached(status);
    status.details.textContent = detail ? `${message} - ${detail}` : message;
    status.status.hidden = false;
  };
  const isAbortError = (event) => {
    const code = Number(event?.errorCode);
    const description = String(event?.errorDescription || '').toUpperCase();
    return code === -3 || description === 'ERR_ABORTED';
  };

  webview.addEventListener('did-start-loading', () => clearWebviewStatus(status));
  webview.addEventListener('did-finish-load', () => clearWebviewStatus(status));
  webview.addEventListener('did-stop-loading', () => clearWebviewStatus(status));
  webview.addEventListener('dom-ready', () => {
    webview.dataset.domReady = 'true';
    clearWebviewStatus(status);
  });
  webview.addEventListener('did-navigate', () => clearWebviewStatus(status));
  webview.addEventListener('did-navigate-in-page', () => clearWebviewStatus(status));
  webview.addEventListener('did-start-navigation', () => clearWebviewStatus(status));
  webview.addEventListener('did-commit-navigation', () => clearWebviewStatus(status));
  webview.addEventListener('will-navigate', () => clearWebviewStatus(status));

  webview.addEventListener('did-fail-load', (event) => {
    if (!event.isMainFrame) return;
    if (isAbortError(event)) {
      clearWebviewStatus(status);
      return;
    }
    const detail = `${event.errorDescription || 'Load failed'} (${event.errorCode})`;
    showStatus('Failed to load web content', detail);
  });

  webview.addEventListener('render-process-gone', (event) => {
    const detail = event?.details?.reason
      ? `Render process gone: ${event.details.reason}`
      : 'Render process gone';
    showStatus('Web view crashed', detail);
  });

  webview.addEventListener('console-message', (event) => {
    const label = node?.title ? `webview:${node.title}` : 'webview';
    console.log(`[${label}]`, event.message);
  });
}
