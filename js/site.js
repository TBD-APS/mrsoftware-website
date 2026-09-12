document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
  }
  var year = document.querySelectorAll('.year');
  year.forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
});