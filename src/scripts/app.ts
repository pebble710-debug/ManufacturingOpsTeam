// Small progressive enhancements for every page. External file only (CSP script-src 'self').

// 1. Nav: at >= 1024 px keep the nav open in browsers without ::details-content support.
const nav = document.querySelector<HTMLDetailsElement>('.nav-disclosure');
if (nav && !CSS.supports('selector(::details-content)')) {
  const mq = window.matchMedia('(min-width: 64rem)');
  const sync = () => { if (mq.matches) nav.open = true; };
  sync();
  mq.addEventListener('change', sync);
}

// 2. Unavailable buttons (aria-disabled): with JS, move focus to the reason instead of submitting.
//    Without JS the submit reaches the server, which answers 403/409 with the same wording.
document.addEventListener('click', (e) => {
  const t = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-unavailable-reason]') : null;
  if (!t) return;
  const reason = document.getElementById(t.dataset.unavailableReason ?? '');
  if (!reason) return;
  e.preventDefault();
  reason.setAttribute('tabindex', '-1');
  reason.focus();
});

// 3. Move focus to the error summary or a flagged alert after a failed submit.
const focusTarget = document.querySelector<HTMLElement>('.error-summary__title, [data-focus-on-load]');
focusTarget?.focus();
