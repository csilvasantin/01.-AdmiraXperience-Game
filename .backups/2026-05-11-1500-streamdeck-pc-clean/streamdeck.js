// streamdeck.js — Admira XP / Stream Deck bridge (Corsair Galleon 100 SD).
//
// Exposes window.AdmiraXP_StreamDeck with a self-registering page of 12
// actions wired to the in-game /telegram dispatcher.
//
// Codex (keyboard daemon side) can:
//   1. Read the page catalogue from window.AdmiraXP_StreamDeck.pages
//   2. Trigger an action via window.AdmiraXP_StreamDeck.press(pageId, btnIdx)
//      or postMessage({type:'admiraxp-sd-press', pageId, btnIdx, requestId}).
//   3. Capture the game canvas as the keyboard main-display feed using
//      ?streamdeck=mirror (clean canvas only) or ?streamdeck=preview
//      (canvas + 12-button grid, for human verification).

(function(){
  if(typeof window==='undefined') return;
  if(window.AdmiraXP_StreamDeck && window.AdmiraXP_StreamDeck._loaded) return;

  const PAGE = {
    id: 'admira-events',
    name: 'Admira Events',
    nameEn: 'Admira Events',
    accent: '#ffd866',
    description: 'Eventos rápidos del Xtanco: NPCs, tienda, ambiente y feeds.',
    descriptionEn: 'Quick Xtanco events: NPCs, store, ambient and feeds.',
    buttons: [
      { id:'thief',   label_es:'LADRÓN',          label_en:'THIEF',          icon:'🚨', color:'#ff5544', cmd:'/ladron' },
      { id:'gc',      label_es:'GUARDIA CIVIL',   label_en:'GUARDIA CIVIL',  icon:'🚓', color:'#4488ff', cmd:'/gc' },
      { id:'opinion', label_es:'OPINADOR',        label_en:'REVIEWER',       icon:'💬', color:'#ffcc44', cmd:'/opinador' },
      { id:'devol',   label_es:'DEVOLUCIÓN',      label_en:'RETURN',         icon:'⚠️', color:'#ff8844', cmd:'/devolucion' },
      { id:'pedido',  label_es:'PEDIDO ESPECIAL', label_en:'SPECIAL ORDER',  icon:'🎩', color:'#cc99ff', cmd:'/pedido' },
      { id:'turno',   label_es:'LLAMAR TURNO',    label_en:'NEXT TICKET',    icon:'🎟️', color:'#44ddff', cmd:'/turno' },
      { id:'dj',      label_es:'DJ NOVAH',        label_en:'DJ NOVAH',       icon:'🎵', color:'#ff66cc', cmd:'/dj on' },
      { id:'robot',   label_es:'UNITREE BOT',     label_en:'UNITREE BOT',    icon:'🤖', color:'#88ee44', cmd:'/robot on' },
      { id:'heat',    label_es:'HEATMAP',         label_en:'HEATMAP',        icon:'🗺️', color:'#aa66ff', cmd:'/heatmap' },
      { id:'amb',     label_es:'AMBIENTE',        label_en:'AMBIENT',        icon:'🔊', color:'#999999', cmd:'/ambiente' },
      { id:'pixer',   label_es:'PIXER FEED',      label_en:'PIXER FEED',     icon:'📺', color:'#ee44cc', cmd:'/pixeria on' },
      { id:'status',  label_es:'ESTADO',          label_en:'STATUS',         icon:'📊', color:'#dddddd', cmd:'/status' },
    ],
  };

  const SD = {
    _loaded: true,
    version: '1.0.0',
    pages: [],
    _dispatcher: null,
    _lastResults: [],
    attach(fn){
      if(typeof fn === 'function') this._dispatcher = fn;
      return this;
    },
    registerPage(page){
      if(!page || !page.id) return;
      const idx = this.pages.findIndex(p => p.id === page.id);
      if(idx >= 0) this.pages[idx] = page; else this.pages.push(page);
      this._emit('admiraxp-sd-pages-changed', { pages: this.pages });
    },
    getPage(pageId){
      return this.pages.find(p => p.id === pageId) || null;
    },
    findButton(pageId, btnIdx){
      const page = this.getPage(pageId);
      if(!page || !Array.isArray(page.buttons)) return null;
      const i = (typeof btnIdx === 'string') ? parseInt(btnIdx,10) : btnIdx;
      return page.buttons[i] || null;
    },
    findButtonById(pageId, buttonId){
      const page = this.getPage(pageId);
      if(!page || !Array.isArray(page.buttons)) return null;
      return page.buttons.find(b => b.id === buttonId) || null;
    },
    async press(pageId, btnRef){
      let btn = (typeof btnRef === 'string' && isNaN(parseInt(btnRef,10)))
        ? this.findButtonById(pageId, btnRef)
        : this.findButton(pageId, btnRef);
      if(!btn) return { ok:false, error:'button not found: '+pageId+'#'+btnRef };
      if(!this._dispatcher) return { ok:false, error:'dispatcher not attached', button: btn };
      try {
        const result = await this._dispatcher(btn.cmd);
        const out = { ok:true, button: btn, result: String(result||'') };
        this._record(out);
        this._emit('admiraxp-sd-press', out);
        return out;
      } catch(e){
        const out = { ok:false, error: String(e && e.message || e), button: btn };
        this._record(out);
        this._emit('admiraxp-sd-press', out);
        return out;
      }
    },
    manifest(){
      return {
        version: this.version,
        generatedAt: new Date().toISOString(),
        pages: this.pages.map(p => ({
          id: p.id,
          name: p.name,
          nameEn: p.nameEn || p.name,
          accent: p.accent || '#ffd866',
          description: p.description || '',
          descriptionEn: p.descriptionEn || p.description || '',
          buttons: (p.buttons||[]).map((b,i) => ({
            index: i,
            id: b.id,
            label_es: b.label_es,
            label_en: b.label_en,
            icon: b.icon || '',
            color: b.color || '#ffffff',
            cmd: b.cmd,
          })),
        })),
      };
    },
    _record(result){
      this._lastResults.unshift({ ts: Date.now(), ...result });
      if(this._lastResults.length > 32) this._lastResults.length = 32;
    },
    _emit(name, detail){
      try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch(_){}
    },
  };

  // postMessage bridge — Codex's daemon may iframe the game, or open a tab
  // and postMessage requests. We answer back with the result on the same channel.
  window.addEventListener('message', async (ev) => {
    const data = ev && ev.data;
    if(!data || typeof data !== 'object') return;
    if(data.type !== 'admiraxp-sd-press' && data.type !== 'admiraxp-sd-manifest') return;
    let payload;
    if(data.type === 'admiraxp-sd-manifest'){
      payload = { type:'admiraxp-sd-manifest-result', requestId: data.requestId, manifest: SD.manifest() };
    } else {
      const result = await SD.press(data.pageId, data.btnIdx != null ? data.btnIdx : data.buttonId);
      payload = { type:'admiraxp-sd-press-result', requestId: data.requestId, ...result };
    }
    try {
      if(ev.source && typeof ev.source.postMessage === 'function'){
        ev.source.postMessage(payload, ev.origin || '*');
      }
    } catch(_){}
  });

  window.AdmiraXP_StreamDeck = SD;
  SD.registerPage(PAGE);
})();
