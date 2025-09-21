// Schudwig Landing Interactions
(() => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Year in footer
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Scroll progress bar
  const progress = document.getElementById('progress');
  const setProgress = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = height > 0 ? Math.min(scrollTop / height, 1) : 0;
    if (progress) progress.style.transform = `scaleX(${ratio})`;
  };
  setProgress();
  window.addEventListener('scroll', setProgress, { passive: true });

  // Reveal on scroll
  const revealEls = Array.from(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  // Tilt cards (disable on touch to save perf)
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const tiltEls = Array.from(document.querySelectorAll('.tilt'));
  if (!isTouch && !prefersReduced) {
    const MAX_TILT_DEG = 10;
    tiltEls.forEach((el) => {
      let raf = 0;
      const rectCache = { w: 0, h: 0 };
      const updateRect = () => {
        const r = el.getBoundingClientRect();
        rectCache.w = r.width; rectCache.h = r.height;
      };
      updateRect();
      window.addEventListener('resize', updateRect);

      const onMove = (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width; // 0..1
        const y = (e.clientY - r.top) / r.height; // 0..1
        const rx = (0.5 - y) * (MAX_TILT_DEG * 2);
        const ry = (x - 0.5) * (MAX_TILT_DEG * 2);
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
        });
      };
      const onLeave = () => {
        cancelAnimationFrame(raf);
        el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
      };
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
    });
  }

  // Magnetic buttons
  const magnets = Array.from(document.querySelectorAll('.magnet'));
  magnets.forEach((el) => {
    if (prefersReduced) return;
    let raf = 0;
    const strength = 20;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.transform = '';
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
  });

  // Pointer glow
  const cursor = document.querySelector('.cursor');
  if (cursor && !prefersReduced) {
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x, ty = y;
    const speed = 0.12;
    const loop = () => {
      x += (tx - x) * speed;
      y += (ty - y) * speed;
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    loop();
  }

  // Parallax hero orbs
  const hero = document.getElementById('hero');
  const red = document.querySelector('.orb-red');
  const blue = document.querySelector('.orb-blue');
  if (hero && red && blue && !prefersReduced) {
    hero.addEventListener('mousemove', (e) => {
      const r = hero.getBoundingClientRect();
      const rx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const ry = (e.clientY - (r.top + r.height / 2)) / r.height;
      red.style.transform = `translate(${rx * 30}px, ${ry * 20}px)`;
      blue.style.transform = `translate(${rx * -25}px, ${ry * -15}px)`;
    });
  }
})();


