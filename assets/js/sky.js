// Sky colors helper — devuelve un array de 3 strings hex con el gradiente
// del cielo según la hora del juego (0-24). El render real del cielo y del
// disco sol/luna sigue inline en game.html (necesita acceso a `cx`, `tt`,
// `W`, `skyTop`, `skyH`) — extraerlo es Fase 3 del plan.

(function(){
  function getSkyColors(hour){
    if (hour < 7)  return ['#0a0a2a','#1a1a3a','#2a2a4a']; // night
    if (hour < 9)  return ['#3a5a8a','#5a7aaa','#8aaacc']; // dawn
    if (hour < 12) return ['#5a99cc','#7ab8dd','#a8d4ee']; // morning
    if (hour < 16) return ['#4a8acc','#6aaadd','#98ccee']; // midday
    if (hour < 18) return ['#cc8844','#dd9955','#eebb77']; // sunset
    if (hour < 19) return ['#aa4433','#cc5544','#dd7755']; // dusk
    if (hour < 20) return ['#3a2244','#4a3355','#5a4466']; // twilight
    return ['#0a0a1a','#1a1a2a','#2a2a3a']; // night
  }
  window.getSkyColors = getSkyColors;
})();
