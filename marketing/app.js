// Admira XP marketing — particle field, scroll reveal, version stamp.
(() => {
  // ── Footer version stamp ──────────────────────────────────
  const footMeta = document.getElementById('footMeta');
  if (footMeta && window.XTANCO_APP) {
    footMeta.textContent = window.XTANCO_APP.version + ' · build ' + window.XTANCO_APP.build;
  }

  // ── Reveal on scroll ──────────────────────────────────────
  const targets = document.querySelectorAll(
    '.section-head, .feature, .stack-col, .cta-final, .demo-frame'
  );
  targets.forEach(el => el.setAttribute('data-reveal', ''));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    targets.forEach(t => io.observe(t));
  } else {
    targets.forEach(t => t.classList.add('is-visible'));
  }

  // ── Background particles (canvas) ─────────────────────────
  // Subtle starfield + occasional cyan/magenta cursors drifting upward.
  // Respects prefers-reduced-motion.
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.getElementById('bg');
  if (!cv || reduce) return;

  const ctx = cv.getContext('2d');
  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  const stars = [];
  const drifts = [];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.width = Math.floor(window.innerWidth * DPR);
    H = cv.height = Math.floor(window.innerHeight * DPR);
    cv.style.width = window.innerWidth + 'px';
    cv.style.height = window.innerHeight + 'px';
    seed();
  }

  function seed() {
    stars.length = 0;
    drifts.length = 0;
    const count = Math.floor((W * H) / (28000 * DPR * DPR));
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: (Math.random() * 1.2 + 0.4) * DPR,
        a: Math.random() * 0.6 + 0.15,
        twk: Math.random() * 0.005 + 0.0015,
        twPhase: Math.random() * Math.PI * 2,
      });
    }
    const driftCount = 14;
    for (let i = 0; i < driftCount; i++) drifts.push(makeDrift(true));
  }

  function makeDrift(initial) {
    const palette = ['#78f3ff', '#ff7eb6', '#a880ff', '#ffd866'];
    return {
      x: Math.random() * W,
      y: initial ? Math.random() * H : H + 20 * DPR,
      vx: (Math.random() - 0.5) * 0.15 * DPR,
      vy: -(0.20 + Math.random() * 0.25) * DPR,
      r: (Math.random() * 1.6 + 0.6) * DPR,
      color: palette[Math.floor(Math.random() * palette.length)],
      life: 0,
      maxLife: 600 + Math.random() * 600,
    };
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(48, now - last);
    last = now;
    acc += dt;

    ctx.clearRect(0, 0, W, H);

    // Stars (twinkle)
    for (const s of stars) {
      const tw = 0.6 + 0.4 * Math.sin(now * s.twk + s.twPhase);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,220,240,${(s.a * tw).toFixed(3)})`;
      ctx.fill();
    }

    // Drift particles
    for (let i = drifts.length - 1; i >= 0; i--) {
      const d = drifts[i];
      d.x += d.vx * dt * 0.06;
      d.y += d.vy * dt * 0.06;
      d.life += dt;
      const fade = d.life < 600 ? d.life / 600 : (d.maxLife - d.life) / 600;
      const alpha = Math.max(0, Math.min(1, fade)) * 0.7;
      ctx.beginPath();
      const grd = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 6);
      grd.addColorStop(0, hex2rgba(d.color, alpha));
      grd.addColorStop(1, hex2rgba(d.color, 0));
      ctx.fillStyle = grd;
      ctx.arc(d.x, d.y, d.r * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = hex2rgba(d.color, Math.min(1, alpha + 0.2));
      ctx.fill();
      if (d.y < -40 * DPR || d.life > d.maxLife) drifts[i] = makeDrift(false);
    }

    requestAnimationFrame(frame);
  }

  function hex2rgba(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  requestAnimationFrame(frame);
})();
