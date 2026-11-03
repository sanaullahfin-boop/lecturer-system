// Applies the saved light/dark theme before the page paints (loaded in <head>).
(function () {
  var pref = 'auto';
  try { pref = localStorage.getItem('sc_theme') || 'auto'; } catch (e) {}
  var dark = pref === 'dark' ||
    (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
