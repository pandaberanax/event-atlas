// This function runs in the inspected tab. Its arguments are serialized by the panel.
export function readPage(key, origin, operation, snapshotParameters) {
  if (location.origin !== origin) return null;
  let state = window[key];
  if (state && (operation === 'remove' || operation === 'start')) {
    state.remove();
    state = null;
  }
  if (operation === 'remove') return null;
  const queue = Array.isArray(window.dataLayer) ? window.dataLayer : null;
  if (!state) {
    state = {queue, offset: operation === 'start' ? queue?.length || 0 : 0, activities: []};
    const describe = (node, allowText) => {
      const tag = node.localName;
      let selector = tag;
      for (let el = node; el; el = el.parentElement) {
        if (el.id) {
          selector = '#' + CSS.escape(el.id) + (el === node ? '' : ' > ' + selector);
          break;
        }
        let index = 1;
        for (let sibling = el.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
          if (sibling.localName === el.localName) index++;
        }
        const part = el.localName + ':nth-of-type(' + index + ')';
        selector = el === node ? part : part + ' > ' + selector;
      }
      const label = node.getAttribute('aria-label') || node.getAttribute('title') ||
        (allowText ? node.textContent.trim() : '') || tag;
      const region = node.closest('header,nav,main,section,footer,form')?.localName || 'body';
      return {tag, text: label.replace(/\s+/g, ' ').slice(0, 160), region, selector};
    };
    const activity = (type, detail) => ({type, page: location.href, time: Date.now(), ...detail});
    const listeners = {
      click(event) {
        const target = event.composedPath()[0];
        if (!event.isTrusted || !target?.closest) return;
        const control = target.closest('a[href],button,input[type=button],input[type=submit],[role=button],[role=tab],summary');
        const editable = target.closest('input,textarea,select,[contenteditable]:not([contenteditable=false])');
        state.activities.push(activity('click', {element: describe(control || target, !!control && !editable)}));
      },
      submit(event) {
        if (event.isTrusted && event.target?.localName === 'form') {
          state.activities.push(activity('submit', {element: describe(event.target, false)}));
        }
      },
      scroll(event) {
        const node = event.target === document ? document.scrollingElement : event.target;
        if (!node || node.closest?.('input,textarea,[contenteditable]')) return;
        // Coalesce a continuous scroll between reads on the same target.
        const item = activity('scroll', {position: Math.max(0, Math.round(node.scrollTop || 0))});
        if (node !== document.scrollingElement && node.localName) item.element = describe(node, false);
        const last = state.activities.at(-1);
        if (last?.type === 'scroll' && last.page === item.page && last.element?.selector === item.element?.selector) {
          state.activities[state.activities.length - 1] = item;
        } else state.activities.push(item);
      }
    };
    state.listen = active => {
      for (const [type, listener] of Object.entries(listeners)) {
        if (active) window.addEventListener(type, listener, {capture: true, passive: true});
        else window.removeEventListener(type, listener, true);
      }
    };
    state.remove = () => {
      clearTimeout(state.timer);
      state.listen(false);
      delete window[key];
    };
    Object.defineProperty(window, key, {value: state, configurable: true});
  }
  clearTimeout(state.timer);
  state.listen(true);
  state.timer = setTimeout(() => state.listen(false), 15000);
  if (queue !== state.queue || queue && queue.length < state.offset) state.offset = 0;
  state.queue = queue;
  const time = Date.now();
  const events = [];
  for (const entry of queue?.slice(state.offset) || []) {
    const isGtag = entry?.[0] === 'event' && typeof entry[1] === 'string';
    const name = isGtag ? entry[1] : entry?.event;
    if (typeof name !== 'string' || !name.trim()) continue;
    let preview;
    try {
      preview = snapshotParameters(isGtag ? entry[2] : entry, {omitEvent:true, redact:true});
    } catch {
      preview = {parameters:{}, parametersTruncated:true};
    }
    events.push({source: isGtag ? 'gtag' : 'dataLayer', name, time, ...preview});
  }
  state.offset = queue?.length || 0;
  return {page: location.href, title: document.title, documentId: performance.timeOrigin, time,
    activities: state.activities.splice(0), events};
}
