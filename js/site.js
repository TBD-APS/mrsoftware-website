(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');

  function ready(run) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }

  ready(function () {
    var header = document.querySelector('.site-header');
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.nav');

    // Desktop menu: an item with pages under it opens a small list on hover or keyboard focus.
    // Matched on the address, so it works on every page's copy of the header.
    var stories = [['The offer', '/stories/the-offer/'], ['The job', '/stories/the-job/'], ['The shipment', '/stories/the-shipment/'], ['The choices', '/stories/the-choices/']];
    var menus = {
      '/#solutions': [['Tradey', '/products/tradey/'], ['Shippy', '/products/shippy/'], ['Roady', '/demo/roady/'], ['Workslip', '/products/workslip/'], ['Demo centre', '/demo/']],
      '/integrations/': [['Greeny emissions example', '/integrations/#greeny-example'], ['Excel and Outlook examples', '/integrations/#examples'], ['What we can connect', '/integrations/#categories']],
      '/roadmap/': [['Greeny', '/roadmap/#greeny-showcase'], ['Reusable Boney modules', '/roadmap/#boney-modules']],
      '/research/': [['Principles', '/research/#principles'], ['Decision gates', '/research/#decision-gates'], ['Evaluation', '/research/#evaluation'], ['Research papers', '/research/#papers']],
      '/stories/': stories,
      '/#stories': stories,
      '/sikkerhed-og-dataprivatliv/': [['Security and data privacy', '/sikkerhed-og-dataprivatliv/'], ['How we validate', '/sikkerhed-og-dataprivatliv/saadan-validerer-vi-os-selv/'], ['System status', '/status/']]
    };
    if (nav) {
      Array.prototype.forEach.call(nav.querySelectorAll(':scope > a:not(.button)'), function (link) {
        link.setAttribute('data-label', link.textContent);
        var url = new URL(link.getAttribute('href'), window.location.href);
        var items = menus[url.pathname + url.hash];
        if (!items) return;
        var group = document.createElement('div');
        group.className = 'nav-group';
        link.parentNode.insertBefore(group, link);
        group.appendChild(link);
        var list = document.createElement('ul');
        list.className = 'nav-sub';
        list.setAttribute('aria-label', link.textContent);
        items.forEach(function (item) {
          var entry = document.createElement('li');
          var sub = document.createElement('a');
          sub.href = item[1];
          sub.textContent = item[0];
          entry.appendChild(sub);
          list.appendChild(entry);
        });
        group.appendChild(list);
        group.addEventListener('keydown', function (event) {
          if (event.key !== 'Escape' || nav.classList.contains('open')) return;
          group.classList.add('is-closed');
          link.focus();
        });
        group.addEventListener('focusout', function (event) { if (!group.contains(event.relatedTarget)) group.classList.remove('is-closed'); });
        group.addEventListener('mouseleave', function () { group.classList.remove('is-closed'); });
      });
    }

    // Mobile menu: opens as a full panel, keeps focus inside the header, closes on Escape, link or resize.
    if (header && toggle && nav) {
      var others = Array.prototype.filter.call(document.body.children, function (node) {
        return node !== header && node.tagName !== 'SCRIPT';
      });
      var isOpen = function () { return nav.classList.contains('open'); };
      var setOpen = function (open) {
        nav.classList.toggle('open', open);
        document.body.classList.toggle('menu-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? toggle.dataset.labelClose : toggle.dataset.labelOpen);
        others.forEach(function (node) { node.inert = open; });
      };
      toggle.addEventListener('click', function () { setOpen(!isOpen()); });
      nav.addEventListener('click', function (event) {
        if (event.target.closest('a')) setOpen(false);
      });
      document.addEventListener('keydown', function (event) {
        if (!isOpen()) return;
        if (event.key === 'Escape') {
          setOpen(false);
          toggle.focus();
          return;
        }
        if (event.key !== 'Tab') return;
        var stops = [toggle].concat(Array.prototype.filter.call(nav.querySelectorAll('a'), function (link) { return link.offsetParent !== null; }));
        var first = stops[0];
        var last = stops[stops.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        else if (stops.indexOf(document.activeElement) === -1) { event.preventDefault(); first.focus(); }
      });
      window.matchMedia('(min-width: 861px)').addEventListener('change', function (query) {
        if (query.matches) setOpen(false);
      });
    }

    // Header gains a hairline and blur once the page has scrolled.
    if (header) {
      var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    var observable = 'IntersectionObserver' in window;

    // Mark the section in view in the main navigation.
    var sectionLinks = Array.prototype.filter.call(document.querySelectorAll('.nav a[href^="#"]:not(.button)'), function (link) {
      return document.querySelector(link.getAttribute('href'));
    });
    if (sectionLinks.length && observable) {
      var current = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          sectionLinks.forEach(function (link) {
            if (link.getAttribute('href') === '#' + entry.target.id) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
          });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sectionLinks.forEach(function (link) { current.observe(document.querySelector(link.getAttribute('href'))); });
    }

    // Reveal content once as it enters the viewport. The CSS only hides it when motion is allowed.
    var reveals = document.querySelectorAll('[data-reveal]');
    if (observable) {
      var reveal = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          reveal.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (node) { reveal.observe(node); });
    } else {
      reveals.forEach(function (node) { node.classList.add('is-visible'); });
    }

    document.querySelectorAll('.year').forEach(function (node) {
      node.textContent = String(new Date().getFullYear());
    });
  });
})();

// Product switcher (tabs) and spotlight cards.
(function () {
  'use strict';
  function ready(run) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }
  ready(function () {
    document.querySelectorAll('[role="tablist"]').forEach(function (list) {
      var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
      function select(tab, focus) {
        tabs.forEach(function (other) {
          var on = other === tab;
          other.setAttribute('aria-selected', String(on));
          other.tabIndex = on ? 0 : -1;
          document.getElementById(other.getAttribute('aria-controls')).hidden = !on;
        });
        if (focus) tab.focus();
      }
      list.addEventListener('click', function (event) {
        var tab = event.target.closest('[role="tab"]');
        if (tab) select(tab, false);
      });
      list.addEventListener('keydown', function (event) {
        var index = tabs.indexOf(document.activeElement);
        if (index === -1) return;
        var next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        select(tabs[(next + tabs.length) % tabs.length], true);
      });
    });

    // Rotating word: one word at a time, paused while the tab is hidden and off under reduced motion.
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('.rotate').forEach(function (box) {
      var words = box.querySelectorAll('.rotate-word');
      if (still || words.length < 2) return;
      var at = 0;
      setInterval(function () {
        if (document.hidden) return;
        var out = words[at];
        at = (at + 1) % words.length;
        var next = words[at];
        out.classList.remove('is-in');
        out.classList.add('is-out');
        next.classList.remove('is-out');
        next.classList.add('is-in');
        setTimeout(function () { out.classList.remove('is-out'); }, 700);
      }, 2400);
    });

    if (window.matchMedia('(hover: hover)').matches) {
      document.querySelectorAll('.spot').forEach(function (card) {
        card.addEventListener('pointermove', function (event) {
          var box = card.getBoundingClientRect();
          card.style.setProperty('--mx', (event.clientX - box.left) + 'px');
          card.style.setProperty('--my', (event.clientY - box.top) + 'px');
        });
      });
    }
  });
})();
