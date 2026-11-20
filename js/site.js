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
        var stops = [toggle].concat(Array.prototype.slice.call(nav.querySelectorAll('a')));
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

    // Ticker: hovering or focusing a system type pauses the strip and shows what it covers, with a link onward.
    document.querySelectorAll('.ticker-wrap').forEach(function (wrap) {
      var detail = wrap.querySelector('.ticker-detail');
      if (!detail) return;
      var active = null;
      function show(link) {
        if (active) active.classList.remove('is-active');
        active = link;
        link.classList.add('is-active');
        detail.querySelector('b').textContent = link.textContent;
        detail.querySelector('p').textContent = link.getAttribute('data-detail');
        var box = wrap.getBoundingClientRect();
        var item = link.getBoundingClientRect();
        var half = Math.min(150, (window.innerWidth - 32) / 2);
        var x = Math.max(16 + half, Math.min(window.innerWidth - 16 - half, item.left + item.width / 2));
        detail.style.setProperty('--x', (x - box.left) + 'px');
        detail.hidden = false;
      }
      function hide() {
        if (active) active.classList.remove('is-active');
        active = null;
        detail.hidden = true;
      }
      wrap.querySelectorAll('.ticker a[data-detail]').forEach(function (link) {
        link.addEventListener('mouseenter', function () { show(link); });
        link.addEventListener('focus', function () { show(link); });
      });
      wrap.addEventListener('mouseleave', hide);
      wrap.addEventListener('focusout', function (event) { if (!wrap.contains(event.relatedTarget)) hide(); });
      wrap.addEventListener('keydown', function (event) { if (event.key === 'Escape') hide(); });
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
