// Looping image carousel: auto-flips, can be flicked/dragged, and resumes
// auto-flipping after the user has been idle for a while. With { scroll: true }
// it also scrolls tall images to their end before each automatic flip.
function startCarousel(el, sources, options = {}) {
  const AUTO_MS = options.autoMs ?? 5000;   // time between automatic flips
  const IDLE_MS = options.idleMs ?? 10000;  // wait after user input before flipping again
  const SLIDE_MS = options.slideMs ?? 500;  // slide animation duration

  // Scroll mode (for tall images such as web page screenshots): images fill the
  // screen width, and autoplay scrolls each one down to its end, half a screen
  // at a time with a pause between steps, before flipping.
  const SCROLL = options.scroll ?? false;
  const SCROLL_STEP = options.scrollStep ?? 0.5;    // each scroll step, in screen heights
  const STEP_MS = options.stepMs ?? 800;            // duration of one scroll step
  const STEP_PAUSE_MS = options.stepPauseMs ?? 1500; // pause between scroll steps
  const START_MS = options.startMs ?? 2000;         // pause at the top before scrolling
  const END_MS = options.endMs ?? 2000;             // pause at the bottom before flipping

  const n = sources.length;
  const makeImg = (src) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.draggable = false;
    return img;
  };

  // A source is either an image path, or an object with per-slide settings:
  //   { src, startMs?, endMs?, width?, height?, overlays?: [{ rect: [x, y, w, h], src?, color?, blend? }] }
  // endMs overrides how long this slide waits before the automatic flip (in
  // scroll mode: the pause at its bottom); startMs overrides the pause at its
  // top before scrolling starts. overlays are pinned to exact pixel
  // positions on the image; width/height are the image's pixel size and rects
  // are in those same pixels.
  // In scroll mode a source can also be a live web page: { page: 'some.html', startMs?, endMs? }.
  // The page is shown in an iframe that the carousel scrolls by sending it
  // messages; the page reports its height back (see site/fix.js). The iframe
  // does not receive clicks, so dragging and scrolling work as with images.
  sources = sources.map((source) => (typeof source === 'string' ? { src: source } : source));
  const slides = sources.map((source) => {
    const slide = document.createElement('div');
    slide.className = 'slide';
    if (source.page) {
      const frame = document.createElement('iframe');
      frame.className = 'page';
      frame.src = source.page;
      frame.tabIndex = -1;
      slide.appendChild(frame);
    } else if (!source.overlays) {
      slide.appendChild(makeImg(source.src));
    } else {
      const frame = document.createElement('div');
      frame.className = 'frame';
      frame.style.setProperty('--ar', source.width / source.height);
      frame.appendChild(makeImg(source.src));
      for (const o of source.overlays ?? []) {
        const [x, y, w, h] = o.rect;
        const node = o.src ? makeImg(o.src) : document.createElement('div');
        node.style.left = `${(x / source.width) * 100}%`;
        node.style.top = `${(y / source.height) * 100}%`;
        node.style.width = `${(w / source.width) * 100}%`;
        node.style.height = `${(h / source.height) * 100}%`;
        if (o.color) node.style.background = o.color;
        if (o.blend) node.style.mixBlendMode = o.blend;
        frame.appendChild(node);
      }
      slide.appendChild(frame);
    }
    el.appendChild(slide);
    return slide;
  });

  // Thin bar that fills up over the time left before the next automatic flip.
  const bar = document.createElement('div');
  bar.className = 'progress';
  el.appendChild(bar);
  let barAnim = null;

  function startBar(ms) {
    barAnim?.cancel();
    barAnim = bar.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: ms, easing: 'linear', fill: 'forwards' }
    );
  }

  const mod = (i) => ((i % n) + n) % n;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  let pos = 0;          // current position in slides; fractional while moving
  let cur = 0;          // slide we are on or heading to (keeps counting up/down)
  let anim = null;      // requestAnimationFrame id of the slide animation
  let timer = null;     // next automatic step (start scrolling, or flip)
  let scrollAnim = null; // requestAnimationFrame id of auto-scroll / momentum

  // Scroll mode state, per slide.
  const scrollY = slides.map(() => 0);
  const heights = slides.map(() => 0);
  const sent = slides.map(() => null); // last scroll position sent to each page slide
  let viewH = 0;

  function measure() {
    viewH = el.clientHeight;
    // (page slides report their own height by message instead)
    if (SCROLL) slides.forEach((s, i) => { if (!sources[i].page) heights[i] = s.firstChild.offsetHeight; });
  }

  const maxScroll = (i) => (SCROLL ? Math.max(0, heights[i] - viewH) : 0);

  function render() {
    slides.forEach((slide, i) => {
      // Signed distance from the current position, wrapped so the carousel loops.
      let d = mod(i - pos);
      if (d > n / 2) d -= n;
      if (n === 2 && d === 1 && pos % 1 > 0.5) d = -1;
      const visible = Math.abs(d) < 1;
      slide.style.visibility = visible ? 'visible' : 'hidden';
      slide.style.transform = `translateX(${d * 100}%)`;
      if (SCROLL) {
        // Images shorter than the screen are centered; taller ones scroll.
        scrollY[i] = clamp(scrollY[i], 0, maxScroll(i));
        if (sources[i].page) {
          if (sent[i] !== scrollY[i]) {
            sent[i] = scrollY[i];
            slide.firstChild.contentWindow?.postMessage({ type: 'carousel-scroll', y: scrollY[i] }, '*');
          }
        } else {
          const y = heights[i] < viewH ? (viewH - heights[i]) / 2 : -scrollY[i];
          slide.firstChild.style.transform = `translateY(${y}px)`;
        }
      }
    });
  }

  function animateTo(target) {
    cancelAnimationFrame(anim);
    cur = target;
    const from = pos;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      pos = from + (target - from) * eased;
      if (t === 1) {
        pos = target;
        // Slides that are now off screen start from the top next time.
        scrollY.forEach((_, i) => { if (i !== mod(target)) scrollY[i] = 0; });
      }
      render();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  // --- Autoplay ---
  function stopAuto() {
    clearTimeout(timer);
    cancelAnimationFrame(scrollAnim);
  }

  function flip() {
    animateTo(cur + 1);
    schedule();
  }

  // Wait, scroll the current slide to its end step by step (if there is
  // anything left to scroll), then flip. `wait` defaults to the normal pause.
  function schedule(wait) {
    stopAuto();
    const i = mod(cur);
    const stepPx = SCROLL_STEP * viewH;
    const remaining = maxScroll(i) - scrollY[i];

    if (remaining < 1 || stepPx <= 0) {
      wait ??= sources[i].endMs ?? AUTO_MS;
      startBar(wait);
      timer = setTimeout(flip, wait);
      return;
    }

    wait ??= sources[i].startMs ?? START_MS;
    const steps = Math.ceil(remaining / stepPx);
    const endMs = sources[i].endMs ?? END_MS;
    startBar(wait + steps * STEP_MS + (steps - 1) * STEP_PAUSE_MS + endMs);

    const scrollStep = () => {
      const from = scrollY[i];
      const to = Math.min(maxScroll(i), from + SCROLL_STEP * viewH);
      const start = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - start) / STEP_MS);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        scrollY[i] = from + (to - from) * eased;
        render();
        if (t < 1) scrollAnim = requestAnimationFrame(frame);
        else if (maxScroll(i) - scrollY[i] < 1) timer = setTimeout(flip, endMs);
        else timer = setTimeout(scrollStep, STEP_PAUSE_MS);
      };
      scrollAnim = requestAnimationFrame(frame);
    };
    timer = setTimeout(scrollStep, wait);
  }

  // Keep scrolling briefly after a vertical flick, then restart the idle wait.
  function coast(i, v) {
    let last = performance.now();
    const step = (now) => {
      const dt = now - last;
      last = now;
      const before = scrollY[i];
      scrollY[i] = clamp(before + v * dt, 0, maxScroll(i));
      v *= Math.pow(0.95, dt / 16);
      render();
      if (Math.abs(v) < 0.02 || scrollY[i] === before) schedule(IDLE_MS);
      else scrollAnim = requestAnimationFrame(step);
    };
    scrollAnim = requestAnimationFrame(step);
  }

  // --- User input: drag / flick (sideways flips, up/down scrolls in scroll mode) ---
  let drag = null;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drag) return;
    cancelAnimationFrame(anim);
    stopAuto();
    barAnim?.cancel(); // empty while the user is holding the image
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    const i = mod(Math.round(pos));
    drag = {
      id: e.pointerId, axis: null, i,
      x: e.clientX, y: e.clientY, pos, scroll: scrollY[i],
      lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, vx: 0, vy: 0,
    };
  });

  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.axis = SCROLL && Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    }
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) {
      drag.vx = (e.clientX - drag.lastX) / dt; // px per ms
      drag.vy = (e.clientY - drag.lastY) / dt;
    }
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    if (drag.axis === 'x') pos = drag.pos - dx / el.clientWidth;
    else scrollY[drag.i] = drag.scroll - dy;
    render();
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    el.classList.remove('dragging');
    const stale = e.timeStamp - d.lastT > 100; // finger paused before lifting
    let target = Math.round(d.pos);
    if (d.axis === 'x') {
      const moved = pos - d.pos;
      const v = stale ? 0 : d.vx;
      if (v < -0.3 || (Math.abs(v) <= 0.3 && moved > 0.25)) target += 1;
      else if (v > 0.3 || (Math.abs(v) <= 0.3 && moved < -0.25)) target -= 1;
    }
    animateTo(target);
    schedule(IDLE_MS);
    if (d.axis === 'y' && !stale && Math.abs(d.vy) > 0.05) coast(d.i, -d.vy);
  }

  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  // --- User input: wheel / trackpad scrolling (scroll mode) ---
  if (SCROLL) {
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (drag || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewH : 1;
      scrollY[mod(cur)] += e.deltaY * unit;
      render();
      schedule(IDLE_MS);
    }, { passive: false });
  }

  // --- User input: keyboard ---
  window.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir || drag) return;
    animateTo(Math.round(pos) + dir);
    schedule(IDLE_MS);
  });

  window.addEventListener('resize', () => {
    measure();
    render();
  });

  if (SCROLL) {
    el.classList.add('scroll');
    // Image heights are only known once loaded; restart the countdown for the
    // slide on screen so its scroll time is counted.
    slides.forEach((slide, i) => {
      slide.querySelector('img')?.addEventListener('load', () => {
        measure();
        render();
        if (!drag && i === mod(cur)) schedule();
      });
    });
    // Page slides tell us their height (again whenever it changes).
    window.addEventListener('message', (e) => {
      if (e.data?.type !== 'carousel-size') return;
      const i = slides.findIndex((s) => s.firstChild.contentWindow && s.firstChild.contentWindow === e.source);
      if (i < 0 || Math.abs(heights[i] - e.data.height) < 1) return;
      heights[i] = e.data.height;
      sent[i] = null; // the page may have reloaded: send its scroll position again
      render();
      if (!drag && i === mod(cur) && scrollY[i] === 0) schedule();
    });
  }

  measure();
  render();
  schedule();
}
