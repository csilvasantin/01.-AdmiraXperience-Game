// SFX engine — fanfares y beeps cortos generados con AudioContext.
// Extraído de game.html en v26.03.05.x como Fase 1 de la modularización
// descrita en MODULES_PLAN.md. Expone window.SFX con la misma API que
// antes; el juego sigue accediendo via `const SFX = window.SFX;`.
//
// El volumen se lee de window.G.sfxVolume si está definido (rango 0-1),
// con fallback 0.7. Esto preserva el comportamiento original.

(function(){
  let ac = null;
  function vol(){
    var G = (typeof window !== 'undefined') ? window.G : null;
    return (G && G.sfxVolume !== undefined) ? G.sfxVolume : 0.7;
  }
  function ctx(){
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) {}
    }
    return ac;
  }
  function tone(freq, dur, type, gain, delay){
    type = type || 'sine';
    gain = (gain === undefined) ? 0.15 : gain;
    delay = delay || 0;
    var a = ctx(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain * vol(), a.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + delay + dur);
    o.connect(g); g.connect(a.destination);
    o.start(a.currentTime + delay); o.stop(a.currentTime + delay + dur);
  }

  window.SFX = {
    cashRegister(){tone(1200,0.06);tone(1600,0.06,'sine',0.12,0.07);tone(2200,0.1,'sine',0.1,0.14);},
    doorBell(){tone(659,0.15);tone(784,0.15,'sine',0.12,0.16);},
    salePop(){tone(500,0.04);tone(800,0.04,'sine',0.1,0.05);},
    hireFanfare(){tone(523,0.1);tone(659,0.1,'sine',0.12,0.12);tone(784,0.12,'sine',0.14,0.24);},
    restockThud(){tone(120,0.12,'triangle',0.2);tone(80,0.08,'triangle',0.1,0.1);},
    rushSiren(){tone(600,0.15,'sawtooth',0.08);tone(800,0.15,'sawtooth',0.08,0.16);tone(600,0.15,'sawtooth',0.08,0.32);},
    inspectionAlarm(){tone(1000,0.08,'square',0.06);tone(1000,0.08,'square',0.06,0.12);tone(1000,0.08,'square',0.06,0.24);},
    weekEnd(){tone(523,0.15,'sine',0.1);tone(659,0.12,'sine',0.08,0.16);tone(784,0.2,'sine',0.12,0.3);},
    gameOver(){tone(400,0.2);tone(300,0.2,'sine',0.12,0.22);tone(200,0.3,'sine',0.14,0.44);},
    levelUp(){tone(784,0.08);tone(988,0.08,'sine',0.1,0.1);tone(1175,0.12,'sine',0.12,0.2);},
    eventChime(){tone(880,0.08,'sine',0.08);tone(1100,0.1,'sine',0.1,0.1);},
    marioCoin(){tone(988,0.08,'square',0.10);tone(1319,0.18,'square',0.12,0.08);},
    thunder(){tone(60,0.4,'sawtooth',0.2);tone(40,0.6,'sawtooth',0.15,0.15);tone(80,0.3,'triangle',0.1,0.4);tone(30,0.5,'sawtooth',0.08,0.6);},
    rainLoop(){tone(200,0.05,'triangle',0.02);tone(350,0.04,'triangle',0.015,0.03);tone(150,0.06,'triangle',0.01,0.06);},
    voteHappy(){tone(659,0.08,'sine',0.1);tone(784,0.08,'sine',0.1,0.09);tone(1047,0.15,'sine',0.12,0.18);},
    voteNeutral(){tone(440,0.12,'triangle',0.08);tone(440,0.08,'triangle',0.05,0.14);},
    voteSad(){tone(400,0.12,'sine',0.1);tone(300,0.15,'sine',0.1,0.13);tone(220,0.2,'sine',0.08,0.28);},
  };
})();
