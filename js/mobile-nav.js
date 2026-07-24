// ==========================================================================
// MOBILE NAVIGATION — adds a hamburger button + slide-in sidebar on phones.
// Included on every page that has a .sidebar; does nothing on pages that
// don't (like the login page), so it's safe to include everywhere.
// ==========================================================================

(function () {
  function init() {
    const sidebar = document.querySelector('.sidebar');
    const topbar = document.querySelector('.topbar');
    if (!sidebar || !topbar) return;

    const overlay = document.createElement('div');
    overlay.className = 'mobile-nav-overlay';
    document.body.appendChild(overlay);

    const btn = document.createElement('button');
    btn.className = 'mobile-menu-btn';
    btn.setAttribute('aria-label', 'Open menu');
    btn.innerHTML = '&#9776;'; // hamburger icon (☰)
    topbar.insertBefore(btn, topbar.firstChild);

    function openMenu() {
      sidebar.classList.add('mobile-open');
      overlay.classList.add('open');
    }
    function closeMenu() {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('open');
    }

    btn.addEventListener('click', openMenu);
    overlay.addEventListener('click', closeMenu);
    // Close the menu automatically once a link is tapped, so it doesn't
    // stay open covering the page you just navigated to.
    sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
