// AMBIENT engine — rumor de fondo + cafetera + lluvia, loop continuo.
// Extraído de game.html como Fase 1 de la modularización (MODULES_PLAN.md).
// Lee window.G.ambient.{enabled,volume} y window.G.weather.type para decidir
// cuánto rumor / lluvia inyectar al master gain. La cafetera dispara via
// setInterval cada 12-25s independiente del game loop.

(function(){
  let ac = null, master = null, started = false;
  const nodes = [];

  function ctx(){
    if (!ac){ try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ return null; } }
    return ac;
  }

  function buildRumorNoise(a){
    const buf = a.createBuffer(1, a.sampleRate*2, a.sampleRate);
    const d = buf.getChannelData(0); let last = 0;
    for (let i=0; i<d.length; i++){ const w = Math.random()*2-1; last = (last + 0.02*w) / 1.02; d[i] = last * 3.5; }
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 460;
    const g = a.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    return { src, gain: g, fade: 0.15 };
  }

  function buildRainNoise(a){
    const buf = a.createBuffer(1, a.sampleRate*2, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0; i<d.length; i++) d[i] = (Math.random()*2-1) * 0.6;
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.6;
    const g = a.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    return { src, gain: g, fade: 0.2 };
  }

  function start(){
    const a = ctx(); if (!a || started) return;
    started = true;
    master = a.createGain(); master.gain.value = 0; master.connect(a.destination);
    nodes.push(buildRumorNoise(a));
    nodes.push(buildRainNoise(a));
    // Cafetera ocasional
    setInterval(function(){
      const G = window.G;
      if (!G || !G.ambient || !G.ambient.enabled) return;
      try {
        const t = a.currentTime;
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'triangle'; o.frequency.value = 1200;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05 * (G.ambient.volume || 0.25), t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 4;
        o.connect(f); f.connect(g); g.connect(master);
        o.start(t); o.stop(t + 0.65);
      } catch (e) {}
    }, 12000 + Math.floor(Math.random()*13000));
  }

  function applyVolumes(){
    if (!ac || !master || !nodes.length) return;
    const G = window.G;
    const vol = (G && G.ambient && G.ambient.enabled) ? (G.ambient.volume || 0.25) : 0;
    const isRain = G && G.weather && G.weather.type === 'rain';
    master.gain.setTargetAtTime(vol, ac.currentTime, 0.4);
    nodes[0].gain.gain.setTargetAtTime(vol * 0.7, ac.currentTime, 0.4);
    nodes[1].gain.gain.setTargetAtTime(isRain ? vol * 0.9 : 0, ac.currentTime, 0.4);
  }

  window.AMBIENT = {
    init(){ start(); },
    update(){ applyVolumes(); },
    pulseTill(){ applyVolumes(); },
  };
})();
