(function () {
  'use strict';

  // The company website and dashboard share the same static deployment.
  if (window.location.hostname !== 'dashboard.mrsoftware.dk') return;

  function mount() {
    var main = document.querySelector('main');
    if (!main || document.getElementById('development-overview')) return;
    var origin = window.location.origin + '/_development';
    var views = {
      tasks: { label: 'Task progress', source: origin + '/' },
      'mr-saasy': { label: 'MR SAASy', source: origin + '/?view=code' },
      tradey: { label: 'Tradey', source: origin + '/?view=code&repo=tradey' }
    };
    var requested = new URL(window.location.href).searchParams.get('development');
    var selected = Object.hasOwn(views, requested) ? requested : 'tasks';
    var view = views[selected];
    function address(key) {
      var url = new URL(window.location.href);
      url.searchParams.set('development', key);
      return url.pathname + url.search;
    }
    function element(tag, text, attributes) {
      var node = document.createElement(tag);
      if (text) node.textContent = text;
      Object.entries(attributes || {}).forEach(function (entry) { node.setAttribute(entry[0], entry[1]); });
      return node;
    }

    var section = element('section', '', { id: 'development-overview', class: 'development-overview', lang: 'en', 'aria-labelledby': 'development-title' });
    var header = element('header', '', { class: 'development-heading' });
    header.append(element('h1', 'Development overview', { id: 'development-title' }));
    header.append(element('a', 'Open full view ↗', { id: 'development-open', class: 'development-open', href: view.source, target: '_blank', rel: 'noopener noreferrer' }));
    section.append(header);
    var nav = element('nav', '', { id: 'development-views', 'aria-label': 'Development views' });
    Object.entries(views).forEach(function (entry) {
      var link = element('a', entry[1].label, { href: address(entry[0]) });
      if (entry[0] === selected) link.setAttribute('aria-current', 'page');
      nav.append(link);
    });
    section.append(nav);
    section.append(element('p', 'Tasks and code connections across MR Software.', { id: 'development-description', class: 'development-help' }));
    var heading = element('h2', '', { id: 'development-view-title' });
    heading.append(element('a', view.label, { href: address(selected) }));
    section.append(heading);
    section.append(element('iframe', '', { id: 'development-frame', src: view.source, title: view.label + ' — MR Software overview', 'aria-describedby': 'development-description', referrerpolicy: 'same-origin' }));

    // Keep the existing company information below the overview, with one main heading.
    var companyHeading = main.querySelector('h1');
    if (companyHeading) {
      var subheading = document.createElement('h2');
      Array.from(companyHeading.attributes).forEach(function (attribute) {
        subheading.setAttribute(attribute.name, attribute.value);
      });
      subheading.append(...companyHeading.childNodes);
      companyHeading.replaceWith(subheading);
    }
    main.prepend(section);
    document.body.classList.add('development-dashboard');
    document.title = 'MR Software — Development overview';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
