// The phone menu belongs to the shared shell, including standalone channel routes.
const nav = document.querySelector('.workspace-nav');
const toggle = nav?.querySelector('.nav-more-toggle');
const menu = nav?.querySelector('.nav-more-menu');

export function closeMore() {
  if (toggle && menu && !menu.hidden) {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
}

if (toggle && menu) {
  toggle.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('a')?.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMore();
      toggle.focus();
    }
  });
  document.addEventListener('click', event => {
    if (event.target instanceof Element && (!event.target.closest('.nav-more') || event.target.closest('.nav-more-menu a'))) closeMore();
  });
}
