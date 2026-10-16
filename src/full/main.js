import FullView from './FullView.svelte';

let currentInstance = null;

export function mountFullView(target, props = {}) {
  if (currentInstance) {
    currentInstance.$set(props);
    return currentInstance;
  }
  target.innerHTML = '';
  currentInstance = new FullView({
    target,
    props
  });
  return currentInstance;
}

export function updateFullView(props = {}) {
  if (currentInstance) {
    currentInstance.$set(props);
  }
}

export function destroyFullView() {
  if (currentInstance) {
    currentInstance.$destroy();
    currentInstance = null;
  }
}

if (typeof window !== 'undefined') {
  window.CCFullView = {
    mount: mountFullView,
    update: updateFullView,
    destroy: destroyFullView,
  };
}
