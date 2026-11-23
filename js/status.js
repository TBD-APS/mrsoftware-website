document.addEventListener('DOMContentLoaded', function () {
  var danish = document.documentElement.lang === 'da';
  var container = document.getElementById('services');
  // These HTML attributes are translated by the compiler, so status results do
  // not depend on a second script loading successfully.
  var labelKeys = {
    'OK': 'labelOk', 'Warning': 'labelWarning', 'Down': 'labelDown',
    'probe': 'labelProbe', 'health': 'labelHealth', 'unreachable': 'labelUnreachable',
    'static host, not pinged': 'labelStatic', 'Last check:': 'labelLastCheck',
    'services responded correctly.': 'labelCompletion'
  };
  var translate = function (value) { return container.dataset[labelKeys[value]] || value; };
  var SERVICES = [
    { id: 'mrsoftware', name: 'mrsoftware.dk', probe: '/ping.json', self: true },
    { id: 'saassy', name: 'saassy.mrsoftware.dk', probe: 'https://saassy.mrsoftware.dk/ping', health: 'https://saassy.mrsoftware.dk/api/saassy/health' },
    { id: 'dev', name: 'dev.mrsoftware.dk', probe: 'https://dev.mrsoftware.dk/ping' },
    { id: 'www', name: 'www.mrsoftware.dk', probe: 'https://www.mrsoftware.dk/', static: true }
  ];
  var lastCheck = document.getElementById('last-check');

  function render(id, label, status, detail) {
    var el = document.getElementById('svc-' + id);
    el.querySelector('.value').textContent = translate(status === 'ok' ? 'OK' : (status === 'warn' ? 'Warning' : 'Down'));
    el.querySelector('.value').className = 'value ' + status;
    el.querySelector('.label').textContent = label + ': ' + detail;
  }

  function check() {
    container.innerHTML = '';
    var okServices = 0;
    var total = SERVICES.length;
    var settled = 0;

    SERVICES.forEach(function (svc) {
      var tile = document.createElement('div');
      tile.className = 'stat';
      tile.id = 'svc-' + svc.id;
      tile.innerHTML = '<div class="value warn">…</div><div class="label">' + svc.name + '</div>';
      container.appendChild(tile);

      var checks = [];
      if (svc.probe) checks.push({ name: 'probe', url: svc.probe, self: svc.probe.charAt(0) === '/' });
      if (svc.health) checks.push({ name: 'health', url: svc.health, self: false });
      if (!checks.length) {
        render(svc.id, svc.name, 'ok', translate('static host, not pinged'));
        okServices += 1;
        settled += 1;
        return;
      }

      Promise.all(checks.map(function (c) {
        return fetch(c.url, c.self ? { cache: 'no-store' } : { mode: 'cors', cache: 'no-store' })
          .then(function (r) { return r.status === 200 ? { ok: true, text: translate(c.name) + ' HTTP 200' } : { ok: false, text: translate(c.name) + ' HTTP ' + r.status }; })
          .catch(function () { return { ok: false, text: translate(c.name) + ' ' + translate('unreachable') }; });
      })).then(function (results) {
        var ok = results.every(function (r) { return r.ok; });
        render(svc.id, svc.name, ok ? 'ok' : 'bad', results.map(function (r) { return r.text; }).join(' · '));
        if (ok) okServices += 1;
        settled += 1;
        if (settled === total) {
          lastCheck.textContent = translate('Last check:') + ' ' + new Date().toLocaleTimeString(danish ? 'da-DK' : 'en-GB') + '. ' + okServices + '/' + total + ' ' + translate('services responded correctly.');
          lastCheck.className = 'note ' + (okServices === total ? 'ok' : 'bad');
        }
      });
    });
  }

  check();
  setInterval(check, 60000);
});
