import { handleResize } from './terminal.js';

export function initSplitters(scope) {
  if (!window.Split) return;
  const containers = Array.from(scope.querySelectorAll('.split[data-split="true"]'));
  containers.forEach((container) => {
    if (container.dataset.splitInitialized === 'true') return;
    const direction = container.dataset.splitDirection === 'column' ? 'vertical' : 'horizontal';
    let sizes; // array
    try {
      sizes = JSON.parse(container.dataset.splitSizes || '[]');
    } catch (err) {
      sizes = [];
    }
    const elements = Array.from(container.querySelectorAll(':scope > .split-slot'));
    if (elements.length < 2) return;

    window.Split(elements, {
      direction,
      sizes: sizes.length === elements.length ? sizes.map((size) => size * 100) : undefined,
      minSize: 120,
      gutterSize: 8,
      snapOffset: 0,
      onDrag: () => handleResize()
    });
    container.dataset.splitInitialized = 'true';
  });
}
