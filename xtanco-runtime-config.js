(() => {
  const root = typeof self !== 'undefined' ? self : window;
  if (root.XTANCO_RUNTIME_CONFIG) return;
  root.XTANCO_RUNTIME_CONFIG = {
    elgato: {
      proxyPort: 9124,
      directIp: '',
      directPort: 9123,
    },
    hue: {
      bridgeIP: '',
      apiKey: '',
      lights: {
        despacho: 9,
        comedor: 8,
      },
      enabled: true,
    },
    telegram: {
      proxyPort: 9124,
      enabled: true,
      proxyUrl: 'https://admira-telegram-bridge.csilvasantin.workers.dev',
      polling: true,
      defaultChatId: '',
    },
    grok: {
      proxyPort: 9124,
      enabled: true,
      proxyUrl: 'https://admira-grok-proxy.csilvasantin.workers.dev',
      // The worker auto-picks Gemini (free) when GEMINI_API_KEY is set, and falls
      // back to xAI Grok otherwise. The model name shown in the UI reflects the
      // free-tier default; the actual model used is reported via /health.
      model: 'gemini-2.5-flash',
    },
    tube: {
      // Public Tailscale Funnel mapped to elgato-proxy (yt-dlp) on the Mac Mini.
      // Setup: `tailscale funnel --bg --set-path=/admira http://127.0.0.1:9126`
      // Then run elgato-proxy.js with `XTANCO_PORT=9126`.
      proxyUrl: 'https://macmini.tail48b61c.ts.net/admira',
      enabled: true,
    },
    occupancy: {
      // Aforo real del punto: la cámara Hikvision (people-counting) hace POST a
      // ieu.ai, que expone el estado en /api/ocuppancy. El juego lo lee y "respira"
      // con la gente real (G.peopleOverride = ocupación real).
      // NOTA: ieu.ai debe permitir CORS desde este origen
      // (Access-Control-Allow-Origin) o el navegador bloqueará la lectura.
      enabled: true,
      url: 'https://ieu.ai/api/ocuppancy',
      pollMs: 5000,
      drive: true, // false = solo muestra el número en el HUD, sin tocar los clientes
    },
  };
})();
