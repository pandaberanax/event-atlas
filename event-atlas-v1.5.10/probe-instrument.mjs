export function instrumentActionInspector() {
  window.__atlasDescribeAction = el => {
    const description = window.__atlasDescribe(el);
    const rect = el.getBoundingClientRect();
    const form = el.form || el.closest('form');
    const label = [description.text, el.value && el.tagName === 'INPUT' ? el.value : '', description.href, el.getAttribute('formaction'), form?.getAttribute('action')].join(' ');
    const authentication = /(?:^|[^a-z])(?:log[ -]?(?:in|out)|sign[ -]?(?:in|out)|masuk|keluar)(?:[^a-z]|$)/i.test(label) || !!form?.querySelector('input[type="password"]');
    const submit = (el.matches('button,input') && ['submit','image'].includes(el.type) && !!form);
    const external = el.tagName === 'A' && /^https?:/.test(el.href) && new URL(el.href).origin !== location.origin;
    const trigger = authentication ? 'authentication' : submit || el.tagName === 'FORM' ? 'form_submit' : external ? 'outbound' : 'click';
    if (el.tagName === 'FORM' && Array.from(el.elements).some(control => ['submit','image'].includes(control.type))) return null;
    let reason = '';
    let manual = false;
    if (authentication) {
      reason = 'Alur login atau logout perlu uji manual.';
      manual = true;
    } else if (rect.width === 0 || rect.height === 0 || getComputedStyle(el).visibility !== 'visible') {
      reason = 'Tidak terlihat';
    } else if (el.matches(':disabled,[aria-disabled="true"]') || el.closest('[inert]')) {
      reason = 'Elemen nonaktif';
    } else if (/hapus|delete|purchase|bayar|beli|checkout|transfer|daftar|register|subscribe|berlangganan|hubungi|whatsapp|tel:|mailto:/i.test(label) || (!submit && /kirim|submit/i.test(label))) {
      reason = 'Aksi sensitif atau kontak';
      manual = true;
    } else if (el.tagName === 'A' && !/^https?:/.test(el.href)) {
      reason = 'Protokol non-web';
      manual = true;
    } else if (el.hasAttribute('download') || /\.(pdf|zip|xlsx?|docx?|mp[34])(?:[?#]|$)/i.test(description.href)) {
      reason = 'Unduhan';
      manual = true;
    } else if (el.tagName === 'FORM') {
      reason = 'Form tanpa tombol submit yang dapat diuji.';
      manual = true;
    } else if ((form && !submit) || (el.matches('button[type="submit"],input[type="submit"]') && !form)) {
      reason = 'Form/submit';
    }
    return {...description, trigger, reason, manual};
  };
}

export function inspectActions() {
  const selectors = 'a[href],button,[role="button"],input[type="button"],input[type="submit"],input[type="image"],form';
  return Array.from(document.querySelectorAll(selectors), window.__atlasDescribeAction).filter(Boolean);
}

export function impressionTargets() {
  const viewportHeight = window.innerHeight;
  return Array.from(document.querySelectorAll('[data-impression],[data-track-impression],[data-promo-id],[data-item-id],[data-product-id]')).flatMap(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < viewportHeight || !rect.width || !rect.height || getComputedStyle(el).visibility !== 'visible') return [];
    return [{...window.__atlasDescribe(el), top:rect.top}];
  }).sort((a,b) => a.top - b.top).slice(0,6);
}

export function inspectVisibility(el) {
  const rect = el.getBoundingClientRect();
  const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
  return rect.width > 0 && rect.height > 0 && width * height > 0 && getComputedStyle(el).visibility === 'visible';
}

export function instrumentGuardedProbe() {
  window.__atlasGuardedProbe = false;
  const open = window.open;
  window.open = function (...args) {
    if (window.__atlasGuardedProbe) return null;
    return Reflect.apply(open, this, args);
  };
  document.addEventListener('click', event => {
    if (!window.__atlasGuardedProbe || !(event.target instanceof Element)) return;
    const link = event.target.closest('a[href]');
    if (!link) return;
    event.preventDefault();
    window.__atlasRecord({source:'navigation', targetUrl:link.href, apiMethod:'link'}).catch(() => {});
  }, true);
}
