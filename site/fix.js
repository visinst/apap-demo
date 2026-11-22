// Small replacements for the original site's JavaScript.

// Links are placeholders: stay where we are.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="#"]');
  if (a) e.preventDefault();
});

// Hero slideshow: fades to the next picture every few seconds; arrows and dots work.
document.querySelectorAll('.hero:not(.hero--static)').forEach((hero) => {
  const slides = [...hero.querySelectorAll('.hero__slide')];
  const dots = [...hero.querySelectorAll('.hero__dot')];
  let current = 0;
  let timer = null;

  function show(i) {
    current = (i + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('is_current', k === current));
    dots.forEach((d, k) => d.classList.toggle('is_current', k === current));
    clearInterval(timer);
    timer = setInterval(() => show(current + 1), 5000);
  }

  hero.querySelector('.hero__arrow--prev').addEventListener('click', () => show(current - 1));
  hero.querySelector('.hero__arrow--next').addEventListener('click', () => show(current + 1));
  dots.forEach((d, k) => d.addEventListener('click', () => show(k)));
  show(0);
});

// Catalogue page: sections of the table of contents collapse, rows are
// reordered by dragging their handle, and the list can be cleared.
// (The round X buttons are for show only.)
document.querySelectorAll('.catalogue_toc').forEach((toc) => {
  const list = toc.querySelector('.catalogue_toc__list');

  toc.addEventListener('click', (e) => {
    const toggle = e.target.closest('.toggle_btn');
    if (toggle) toggle.closest('li').classList.toggle('is_collapsed');
  });

  // Drag a row by its handle to move it among its siblings; anything nested
  // under the row moves with it.
  let drag = null;

  toc.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.reorderable');
    if (!handle || drag) return;
    e.preventDefault();
    drag = { id: e.pointerId, item: handle.closest('li') };
    handle.setPointerCapture(e.pointerId);
    drag.item.classList.add('is_dragging');
    toc.classList.add('is_reordering');
  });

  toc.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const item = drag.item;
    const half = item.getBoundingClientRect().height / 2;
    const prev = item.previousElementSibling;
    const next = item.nextElementSibling;
    if (prev && e.clientY < prev.getBoundingClientRect().top + half) {
      prev.before(item);
    } else if (next && e.clientY > next.getBoundingClientRect().bottom - half) {
      next.after(item);
    }
  });

  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.item.classList.remove('is_dragging');
    toc.classList.remove('is_reordering');
    drag = null;
  };
  toc.addEventListener('pointerup', endDrag);
  toc.addEventListener('pointercancel', endDrag);

  const clear = toc.closest('.catalogue_section').querySelector('.clear_catalogue_btn');
  if (clear) clear.addEventListener('click', () => {
    list.replaceChildren();
    toc.classList.add('is_empty');
  });
});

// When shown inside the carousel (web.html): report the page height to it and
// scroll when it says so. The carousel hides this page's own scrollbar.
if (window.parent !== window) {
  document.documentElement.classList.add('is_embedded');
  const report = () => window.parent.postMessage(
    { type: 'carousel-size', height: document.documentElement.scrollHeight }, '*');
  window.addEventListener('load', report);
  window.addEventListener('resize', report);
  new ResizeObserver(report).observe(document.body);
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'carousel-scroll') window.scrollTo(0, e.data.y);
  });
  report();
}

// ?idleTop=<seconds>: scroll back to the top after that long without any input
// (used by catalogue-demo.html).
{
  const seconds = Number(new URLSearchParams(window.location.search).get('idleTop'));
  if (seconds > 0) {
    let timer = null;
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), seconds * 1000);
    };
    for (const type of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart', 'touchmove', 'scroll']) {
      window.addEventListener(type, restart, { passive: true });
    }
    restart();
  }
}
