// Heat map render — overlay isométrico amarillo→rojo según concentración
// de visitas de socios sobre cada tile del estanco. Extraído de drawShop
// como Fase 1 de modularización (MODULES_PLAN.md).
//
// API: drawSocioHeatmap({cx, ISO, tt, G, toIso})
//   - cx: CanvasRenderingContext2D
//   - ISO: {cols, rows, tileW, tileH}
//   - tt: tick contador del juego (para pulso animado)
//   - G: estado del juego (lee G.socioHeat.{enabled,grid,max})
//   - toIso: function(col,row) → {x,y} en pantalla

(function(){
  function drawSocioHeatmap(opts){
    const cx = opts.cx, ISO = opts.ISO, tt = opts.tt, G = opts.G, toIso = opts.toIso;
    if (!G || !G.socioHeat || !G.socioHeat.enabled || !(G.socioHeat.max > 0)) return;
    const grid = G.socioHeat.grid, mx = G.socioHeat.max;
    cx.save();
    for (const k in grid){
      const v = grid[k]; if (!v) continue;
      const parts = k.split(',');
      const c = parseInt(parts[0]), r = parseInt(parts[1]);
      if (!Number.isFinite(c) || !Number.isFinite(r)) continue;
      if (c < 0 || c >= ISO.cols || r < 0 || r >= ISO.rows) continue;
      const intensity = Math.min(1, v / mx);
      const pulse = 0.85 + 0.15 * Math.sin(tt * 0.06);
      const red = 200 + Math.floor(55 * intensity);
      const green = Math.floor(180 * (1 - intensity));
      const alpha = (0.18 + 0.42 * intensity) * pulse;
      cx.fillStyle = 'rgba(' + red + ',' + green + ',40,' + alpha.toFixed(3) + ')';
      const p = toIso(c, r);
      cx.beginPath();
      cx.moveTo(p.x, p.y - ISO.tileH / 2);
      cx.lineTo(p.x + ISO.tileW / 2, p.y);
      cx.lineTo(p.x, p.y + ISO.tileH / 2);
      cx.lineTo(p.x - ISO.tileW / 2, p.y);
      cx.closePath();
      cx.fill();
    }
    cx.restore();
  }
  window.drawSocioHeatmap = drawSocioHeatmap;
})();
