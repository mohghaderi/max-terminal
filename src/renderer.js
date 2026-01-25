import { buildNode } from './renderer/layout.js';
import { initSplitters } from './renderer/splitters.js';
import { handleResize } from './renderer/terminal.js';

const root = document.getElementById('root');

window.addEventListener('resize', handleResize);

(async () => {
  try {
    const layout = await window.maxTerminal.loadLayout();
    console.log('[layout] received layout', layout);
    if (!layout || (layout.type === 'tabs' && Array.isArray(layout.children) && layout.children.length === 0)) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No tabs found. Add JSON files under conf/tabs (files starting with "_" are ignored).';
      root.appendChild(empty);
      return;
    }
    root.appendChild(buildNode(layout));
    initSplitters(root);
    handleResize();
  } catch (err) {
    console.error('[layout] failed to build layout', err);
    const errorPane = document.createElement('div');
    errorPane.className = 'empty-state';
    errorPane.textContent = `Failed to load layout: ${err?.message || err}`;
    root.appendChild(errorPane);
  }
})();
