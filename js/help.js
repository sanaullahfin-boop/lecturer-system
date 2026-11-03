// HELP PAGE — builds the contents list and a simple search over the guide.
(function () {
  const guide = document.getElementById('guide');
  if (!guide) return;
  requireAuthAny();
  const heads = [...guide.querySelectorAll('h2, h3')];
  heads.forEach((el, i) => { if (!el.id) el.id = 'g-' + i + '-' + el.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40); });
  const toc = document.getElementById('guide-toc');
  if (toc) toc.innerHTML = '<div class="nav-group-label" style="color:var(--slate);margin:0 0 8px;">Contents</div>' +
    heads.filter(x => x.tagName === 'H2').map(x => `<a href="#${x.id}">${escapeHtml(x.textContent)}</a>`).join('');
  const search = document.getElementById('guide-search');
  if (search) search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    guide.querySelectorAll('mark.hit').forEach(m => m.replaceWith(m.textContent));
    if (q.length < 3) return;
    const first = [...guide.querySelectorAll('p, li, td, h2, h3')].find(el => el.textContent.toLowerCase().includes(q));
    if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.style.outline = '2px solid var(--brass)'; setTimeout(() => { first.style.outline = ''; }, 1600); }
  });
  if (location.hash) { const t = document.querySelector(location.hash); if (t) setTimeout(() => t.scrollIntoView(), 50); }

  function requireAuthAny() {
    auth.onAuthStateChanged(async user => {
      if (!user) { location.href = 'index.html'; return; }
      try {
        const a = await db.collection('admins').doc(user.uid).get();
        if (a.exists) { setUserChip(a.data().name || user.email); return; }
        const roll = localStorage.getItem('lms_student_roll');
        const sd = roll ? await db.collection('students').doc(roll).get() : null;
        setUserChip(sd && sd.exists ? (sd.data().name || roll) : (roll || 'Student'));
      } catch (e) { setUserChip('You'); }
    });
  }
})();
