// Endpoint que sirve el widget de feedback estilo Marker.io.
// Se incluye en sitios externos como:
//   <script src="https://tuapp.com/widget.js?token=mf_xxx" defer></script>

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDGET_VERSION = "1";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Cuando el server corre detrás de un túnel/proxy (cloudflared, ngrok, Vercel),
  // req.url puede resolver al host interno (localhost). Leemos los headers forwarded
  // para que el apiBase apunte al host público real desde donde se sirvió este widget.
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? url.host;
  const proto = forwardedProto ? `${forwardedProto}:` : url.protocol;
  const apiBase = `${proto}//${host}`;

  const js = `
/* MarketaFlow Widget v${WIDGET_VERSION} */
(function(){
  if (window.__MFWidgetLoaded) return;
  window.__MFWidgetLoaded = true;

  var SCRIPT = document.currentScript || (function(){
    var s = document.querySelectorAll('script[src*="widget.js"]');
    return s[s.length - 1];
  })();
  var SRC = SCRIPT && SCRIPT.src ? SCRIPT.src : '';
  var TOKEN = '';
  try { TOKEN = new URL(SRC).searchParams.get('token') || ''; } catch(e){}
  if (!TOKEN) {
    console.warn('[MarketaFlow] widget cargó sin token. Agregá ?token=tu_token al src.');
    return;
  }

  var API_BASE = ${JSON.stringify(apiBase)};
  var FEEDBACK_URL = API_BASE + '/api/widget/feedback';
  var HEARTBEAT_URL = API_BASE + '/api/widget/heartbeat';

  function sendHeartbeat() {
    var payload = JSON.stringify({
      token: TOKEN,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
    });
    // Usamos fetch con keepalive y Content-Type: text/plain para evitar preflight CORS.
    // El server parsea el body como JSON igual.
    fetch(HEARTBEAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: payload,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    }).then(function(r){
      if (r && r.ok) {
        console.log('[MarketaFlow] heartbeat ok', window.location.href);
      } else if (r) {
        console.warn('[MarketaFlow] heartbeat failed status=' + r.status);
      }
    }).catch(function(err){
      console.warn('[MarketaFlow] heartbeat error', err);
    });
  }

  // ============ Estado ============
  var state = {
    open: false,
    commentMode: false,
    draft: null, // {x, y, screenshot}
    reporterName: localStorage.getItem('mf:widget:name') || '',
    reporterEmail: localStorage.getItem('mf:widget:email') || '',
    sending: false,
  };

  // ============ Helpers ============
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'style' && typeof attrs[k] === 'object') {
          for (var sk in attrs[k]) n.style[sk] = attrs[k][sk];
        } else if (k.indexOf('on') === 0) {
          n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (k === 'html') {
          n.innerHTML = attrs[k];
        } else {
          n.setAttribute(k, attrs[k]);
        }
      }
    }
    (children || []).forEach(function(c){ if (c) n.appendChild(c); });
    return n;
  }
  function txt(s){ return document.createTextNode(s); }

  // Sube el árbol DOM hasta encontrar el "componente" más cercano al click.
  // Heurística: button, a, input, [role], elementos con clases tipo card/btn/section,
  // o el elemento más cercano con dimensiones razonables.
  function findComponent(elTarget) {
    if (!elTarget) return null;
    var COMPONENT_TAGS = { BUTTON:1, A:1, INPUT:1, SELECT:1, TEXTAREA:1, IMG:1, VIDEO:1, NAV:1, HEADER:1, FOOTER:1, ARTICLE:1, SECTION:1, ASIDE:1, FORM:1 };
    var COMPONENT_CLASS_RE = /\b(btn|button|card|hero|banner|tile|item|product|service|feature|cta|callout|panel|widget|media|image|gallery|nav|menu|tab|alert)(s|--|__|-|\b)/i;
    var current = elTarget;
    var depth = 0;
    while (current && current !== document.body && current !== document.documentElement && depth < 12) {
      depth++;
      // 1) Tag semánticamente componente
      if (COMPONENT_TAGS[current.tagName]) return current;
      // 2) Tiene role explícito
      if (current.hasAttribute && current.hasAttribute('role')) return current;
      // 3) Clase con palabra-clave de componente
      var cls = '';
      if (typeof current.className === 'string') cls = current.className;
      else if (current.className && current.className.baseVal) cls = current.className.baseVal;
      if (cls && COMPONENT_CLASS_RE.test(cls)) return current;
      current = current.parentElement;
    }
    // 4) Fallback: el elemento original
    return elTarget;
  }

  function rectOfElement(el) {
    var r = el.getBoundingClientRect();
    return {
      top: r.top + window.scrollY,
      left: r.left + window.scrollX,
      width: r.width,
      height: r.height,
    };
  }

  function cssSelectorOf(elTarget) {
    if (!(elTarget instanceof Element)) return null;
    var path = [];
    var node = elTarget;
    while (node && node.nodeType === 1 && path.length < 6) {
      var seg = node.nodeName.toLowerCase();
      if (node.id) { seg += '#' + node.id; path.unshift(seg); break; }
      if (node.classList && node.classList.length) {
        var classes = Array.prototype.slice.call(node.classList).slice(0, 2).join('.');
        if (classes) seg += '.' + classes;
      }
      var parent = node.parentNode;
      if (parent && parent.nodeType === 1) {
        var siblings = parent.children;
        if (siblings.length > 1) {
          var index = Array.prototype.indexOf.call(siblings, node) + 1;
          seg += ':nth-child(' + index + ')';
        }
      }
      path.unshift(seg);
      node = parent;
    }
    return path.join(' > ');
  }

  function loadScript(src) {
    return new Promise(function(resolve, reject){
      if (document.querySelector('script[data-mf-h2c]')) return resolve();
      var s = document.createElement('script');
      s.src = src;
      s.dataset.mfH2c = '1';
      s.onload = function(){ resolve(); };
      s.onerror = function(){ reject(new Error('No se pudo cargar html2canvas')); };
      document.head.appendChild(s);
    });
  }

  async function ensureH2C() {
    if (window.html2canvas) return window.html2canvas;
    await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
    return window.html2canvas;
  }

  async function captureViewport() {
    try {
      var h2c = await ensureH2C();
      // Capturamos el body completo; con scrollX/Y y windowWidth/Height
      var canvas = await h2c(document.body, {
        useCORS: true,
        allowTaint: true,
        scale: window.devicePixelRatio > 1 ? 1.25 : 1,
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
        ignoreElements: function(el){
          return el.id && el.id.indexOf('mf-widget-') === 0;
        }
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('[MarketaFlow] captureViewport falló', e);
      return null;
    }
  }

  // ============ Estilos ============
  var STYLES = [
    '#mf-widget-root, #mf-widget-root * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
    '#mf-widget-fab { position: fixed; bottom: 20px; right: 20px; z-index: 2147483640; width: 52px; height: 52px; border-radius: 999px; background: linear-gradient(135deg, #3b5fff 0%, #8a2be2 35%, #ff4d8f 70%, #ff2d55 100%); border: 0; color: white; cursor: pointer; box-shadow: 0 8px 24px -8px rgba(255,77,143,0.5); display: grid; place-items: center; transition: transform .15s ease; }',
    '#mf-widget-fab:hover { transform: translateY(-2px) scale(1.04); }',
    '#mf-widget-fab svg { width: 22px; height: 22px; }',
    '#mf-widget-banner { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 2147483641; background: white; color: #1d1d1f; padding: 10px 14px; border-radius: 999px; box-shadow: 0 8px 24px -4px rgba(0,0,0,.18); display: flex; align-items: center; gap: 10px; font-size: 13px; border: 1px solid rgba(0,0,0,.08); }',
    '#mf-widget-banner button { background: transparent; border: 0; color: #6e6e73; cursor: pointer; font-size: 12px; padding: 4px 8px; border-radius: 6px; }',
    '#mf-widget-banner button:hover { background: rgba(0,0,0,.05); color: #1d1d1f; }',
    '#mf-widget-overlay { position: fixed; inset: 0; z-index: 2147483639; cursor: crosshair; background: rgba(138,43,226,0.04); }',
    '#mf-widget-pin { position: fixed; transform: translate(-50%,-50%); z-index: 2147483641; pointer-events: none; }',
    '#mf-widget-pin .dot { width: 24px; height: 24px; border-radius: 999px; background: linear-gradient(135deg,#3b5fff,#8a2be2,#ff4d8f); box-shadow: 0 0 0 3px white, 0 4px 12px rgba(0,0,0,.15); animation: mf-pulse 1.6s infinite; }',
    '@keyframes mf-pulse { 0%,100%{ transform: scale(1);} 50%{ transform: scale(1.15);} }',
    '#mf-widget-popover { position: fixed; z-index: 2147483641; width: 320px; max-width: calc(100vw - 32px); background: white; border-radius: 14px; padding: 14px; box-shadow: 0 16px 48px -8px rgba(0,0,0,.25); border: 1px solid rgba(0,0,0,.08); }',
    '#mf-widget-popover h3 { margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #1d1d1f; }',
    '#mf-widget-popover label { display: block; font-size: 11px; font-weight: 600; color: #6e6e73; margin: 8px 0 4px; }',
    '#mf-widget-popover input, #mf-widget-popover textarea { width: 100%; border: 1px solid rgba(0,0,0,.12); border-radius: 8px; padding: 8px 10px; font-size: 13px; background: white; color: #1d1d1f; resize: none; outline: none; transition: border .15s; }',
    '#mf-widget-popover input:focus, #mf-widget-popover textarea:focus { border-color: #8a2be2; }',
    '#mf-widget-popover .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }',
    '#mf-widget-popover .btn { border: 0; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }',
    '#mf-widget-popover .btn-cancel { background: transparent; color: #6e6e73; }',
    '#mf-widget-popover .btn-send { background: linear-gradient(135deg,#3b5fff,#8a2be2,#ff4d8f); color: white; box-shadow: 0 4px 12px -4px rgba(255,77,143,.5); }',
    '#mf-widget-popover .btn:disabled { opacity: .5; cursor: not-allowed; }',
    '#mf-widget-popover .err { color: #d12c5c; font-size: 11px; margin-top: 6px; }',
    '#mf-widget-popover .ok { color: #047857; font-size: 12px; text-align: center; padding: 8px 0; }',
  ].join('\\n');

  function injectStyles() {
    if (document.getElementById('mf-widget-styles')) return;
    var s = document.createElement('style');
    s.id = 'mf-widget-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  // ============ UI ============
  var fab, banner, overlay, pin, popover;

  function showFab() {
    if (fab) return;
    fab = el('button', {
      id: 'mf-widget-fab',
      title: 'Dejar comentario',
      onclick: enterCommentMode,
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
    });
    document.body.appendChild(fab);
  }
  function hideFab(){ if (fab && fab.parentNode) { fab.parentNode.removeChild(fab); fab = null; } }

  function showBanner() {
    if (banner) return;
    banner = el('div', { id: 'mf-widget-banner' }, [
      txt('🎯 Modo comentario · click sobre cualquier parte de la página'),
      el('button', { onclick: exitCommentMode }, [ txt('Cancelar') ])
    ]);
    document.body.appendChild(banner);
  }
  function hideBanner(){ if (banner && banner.parentNode) { banner.parentNode.removeChild(banner); banner = null; } }

  function showOverlay() {
    if (overlay) return;
    overlay = el('div', { id: 'mf-widget-overlay', onclick: onOverlayClick });
    document.body.appendChild(overlay);
  }
  function hideOverlay(){ if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); overlay = null; } }

  function placePin(x, y) {
    removePin();
    pin = el('div', { id: 'mf-widget-pin', style: { left: x + 'px', top: y + 'px' } }, [
      el('div', { class: 'dot' })
    ]);
    document.body.appendChild(pin);
  }
  function removePin(){ if (pin && pin.parentNode) { pin.parentNode.removeChild(pin); pin = null; } }

  function showPopover(x, y) {
    closePopover();
    var leftPx = Math.min(window.innerWidth - 340, Math.max(16, x - 160));
    var topPx = Math.min(window.innerHeight - 280, y + 16);
    popover = el('div', { id: 'mf-widget-popover', style: { left: leftPx + 'px', top: topPx + 'px' } });

    var h = el('h3'); h.textContent = '✏️ Tu comentario';
    popover.appendChild(h);

    if (!state.reporterName) {
      var lbl1 = el('label'); lbl1.textContent = 'Tu nombre';
      var inputName = el('input', { type: 'text', placeholder: 'Ej: María García' });
      inputName.value = state.reporterName;
      popover.appendChild(lbl1);
      popover.appendChild(inputName);
    }

    var lbl2 = el('label'); lbl2.textContent = 'Comentario';
    var textarea = el('textarea', { rows: 4, placeholder: 'Describí lo que viste o el cambio que querés…' });
    popover.appendChild(lbl2);
    popover.appendChild(textarea);

    var err = el('div', { class: 'err' });
    popover.appendChild(err);

    var actions = el('div', { class: 'actions' });
    var cancelBtn = el('button', { class: 'btn btn-cancel', type: 'button', onclick: closeDraft }, [ txt('Cancelar') ]);
    var sendBtn = el('button', { class: 'btn btn-send', type: 'button' }, [ txt('Enviar') ]);
    actions.appendChild(cancelBtn);
    actions.appendChild(sendBtn);
    popover.appendChild(actions);

    sendBtn.addEventListener('click', async function(){
      var name = state.reporterName;
      if (!name) {
        var nameInput = popover.querySelector('input[type="text"]');
        name = nameInput ? nameInput.value.trim() : '';
        if (!name) { err.textContent = 'Tu nombre es obligatorio'; return; }
      }
      var bodyText = textarea.value.trim();
      if (!bodyText) { err.textContent = 'Escribí un comentario'; return; }
      err.textContent = '';
      sendBtn.disabled = true; cancelBtn.disabled = true;
      sendBtn.textContent = 'Enviando…';

      try {
        var ok = await sendFeedback(bodyText, name);
        if (ok) {
          state.reporterName = name;
          try { localStorage.setItem('mf:widget:name', name); } catch(e){}
          popover.innerHTML = '';
          var okMsg = el('div', { class: 'ok' });
          okMsg.textContent = '✅ ¡Gracias! Tu feedback se envió.';
          popover.appendChild(okMsg);
          setTimeout(closeDraft, 1500);
        } else {
          err.textContent = 'No se pudo enviar. Probá de nuevo.';
          sendBtn.disabled = false; cancelBtn.disabled = false;
          sendBtn.textContent = 'Enviar';
        }
      } catch(e) {
        err.textContent = 'Error: ' + (e && e.message || e);
        sendBtn.disabled = false; cancelBtn.disabled = false;
        sendBtn.textContent = 'Enviar';
      }
    });

    document.body.appendChild(popover);
    setTimeout(function(){ textarea.focus(); }, 50);
  }
  function closePopover(){ if (popover && popover.parentNode) { popover.parentNode.removeChild(popover); popover = null; } }

  function closeDraft() {
    state.draft = null;
    removePin();
    closePopover();
    // Volvemos al modo comentario activo (puede pinear de nuevo) o salimos
    state.commentMode = false;
    hideOverlay();
    hideBanner();
    showFab();
  }

  // ============ Flow ============
  function enterCommentMode() {
    state.commentMode = true;
    hideFab();
    showBanner();
    showOverlay();
  }

  function exitCommentMode() {
    state.commentMode = false;
    state.draft = null;
    removePin();
    closePopover();
    hideOverlay();
    hideBanner();
    showFab();
  }

  async function onOverlayClick(e) {
    if (state.draft) return;
    var x = e.clientX, y = e.clientY;
    // Calculamos elemento bajo el click usando elementsFromPoint con overlay temporalmente oculto
    overlay.style.pointerEvents = 'none';
    var elementsUnder = document.elementsFromPoint(x, y).filter(function(elU){
      return !(elU.id && elU.id.indexOf('mf-widget-') === 0);
    });
    overlay.style.pointerEvents = '';
    var clicked = elementsUnder[0] || null;
    var selector = clicked ? cssSelectorOf(clicked) : null;

    placePin(x, y);
    // Captura screenshot ANTES de mostrar popover (para que popover no esté en la imagen)
    var screenshot = await captureViewport();
    if (!screenshot) {
      removePin();
      alert('[MarketaFlow] No se pudo capturar la página. Verificá que html2canvas pudo correr.');
      return;
    }
    state.draft = {
      x: x / window.innerWidth,
      y: y / window.innerHeight,
      screenshot: screenshot,
      selector: selector,
      pageUrl: window.location.href,
      pageTitle: document.title,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      scrollY: window.scrollY,
    };
    showPopover(x, y);
  }

  async function sendFeedback(bodyText, name) {
    if (!state.draft) return false;
    var d = state.draft;
    try {
      var res = await fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: TOKEN,
          body: bodyText,
          reporterName: name,
          reporterEmail: state.reporterEmail || null,
          pageUrl: d.pageUrl,
          pageTitle: d.pageTitle,
          selector: d.selector,
          x: d.x,
          y: d.y,
          viewportW: d.viewportW,
          viewportH: d.viewportH,
          scrollY: d.scrollY,
          screenshotBase64: d.screenshot,
        })
      });
      return res.ok;
    } catch (e) {
      console.error('[MarketaFlow] feedback failed', e);
      return false;
    }
  }

  // ============ Bridge para MarketaFlow (live mode desde dashboard) ============
  // El widget NO muestra UI propia. Solo responde a postMessage del parent (iframe host).
  var parentOrigin = null;
  function postToParent(payload) {
    if (!parentOrigin || !window.parent || window.parent === window) return;
    try { window.parent.postMessage(payload, parentOrigin); } catch(e){}
  }

  // Reporta scroll/resize en vivo al parent para que los pines sigan al contenido.
  // Usamos requestAnimationFrame (60Hz exacto, sin throttle artificial) para que
  // los pines acompañen el scroll sin lag perceptible.
  function reportViewport() {
    if (!parentOrigin) return;
    postToParent({
      mf: 'viewport',
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    });
    reportPinPositions();
  }
  var rafScheduled = false;
  function reportScrollRAF() {
    if (rafScheduled || !parentOrigin) return;
    rafScheduled = true;
    requestAnimationFrame(function(){
      rafScheduled = false;
      reportViewport();
    });
  }
  window.addEventListener('scroll', reportScrollRAF, { passive: true });
  window.addEventListener('resize', reportViewport);
  // Si el DOM cambia (lazy load, expand de menus, etc), recalcular posiciones
  if (typeof MutationObserver !== 'undefined') {
    var mo = new MutationObserver(function(){ reportScrollRAF(); });
    if (document.body) {
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: false });
    } else {
      document.addEventListener('DOMContentLoaded', function(){
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: false });
      });
    }
  }
  window.addEventListener('message', async function(ev){
    var data = ev && ev.data;
    if (!data || typeof data !== 'object' || !data.mf) return;

    if (data.mf === 'hello') {
      // Auth: el parent debe mandar el widgetToken correcto.
      if (data.widgetToken !== TOKEN) {
        try { ev.source && ev.source.postMessage({ mf: 'auth-failed' }, ev.origin); } catch(e){}
        return;
      }
      parentOrigin = ev.origin;
      postToParent({
        mf: 'ready',
        pageUrl: window.location.href,
        pageTitle: document.title,
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      });
      return;
    }

    if (data.mf === 'click-context' && parentOrigin === ev.origin) {
      // Live mode: detectamos el COMPONENTE bajo el click (no un pixel cualquiera).
      // Anclamos el pin al componente entero, así sigue al elemento si reflowea.
      var requestId = data.requestId || null;
      try {
        var raw = (typeof data.clientX === 'number' && typeof data.clientY === 'number')
          ? document.elementsFromPoint(data.clientX, data.clientY)[0] || null
          : null;
        var component = raw ? findComponent(raw) : null;
        var elRect = component ? rectOfElement(component) : null;
        postToParent({
          mf: 'click-context-ok',
          requestId: requestId,
          pageUrl: window.location.href,
          pageTitle: document.title,
          selector: component ? cssSelectorOf(component) : null,
          elRect: elRect,
          viewportW: window.innerWidth,
          viewportH: window.innerHeight,
          scrollY: window.scrollY,
        });
      } catch (e) {
        postToParent({ mf: 'click-context-error', requestId: requestId, error: String(e && e.message || e) });
      }
      return;
    }

    // Highlight on hover: el parent envía coords y nosotros devolvemos el rect del componente
    // para que pinte un rectángulo translúcido encima.
    if (data.mf === 'hover-component' && parentOrigin === ev.origin) {
      try {
        var hovered = (typeof data.clientX === 'number' && typeof data.clientY === 'number')
          ? document.elementsFromPoint(data.clientX, data.clientY)[0] || null
          : null;
        var hoverComp = hovered ? findComponent(hovered) : null;
        if (hoverComp) {
          var hr = hoverComp.getBoundingClientRect();
          postToParent({
            mf: 'hover-rect',
            clientLeft: hr.left,
            clientTop: hr.top,
            width: hr.width,
            height: hr.height,
            tagName: hoverComp.tagName.toLowerCase(),
          });
        } else {
          postToParent({ mf: 'hover-rect', clientLeft: null, clientTop: null });
        }
      } catch(e) {}
      return;
    }

    // Scroll programático al elemento de un selector (cuando el usuario toca un thread)
    if (data.mf === 'scroll-to-selector' && parentOrigin === ev.origin) {
      try {
        var sel = data.selector;
        if (sel) {
          var elTarget = document.querySelector(sel);
          if (elTarget && elTarget.scrollIntoView) {
            elTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          }
        }
      } catch(e){}
      return;
    }

    // ============ Tracking de pines: el parent registra pines y nosotros recalculamos
    // sus posiciones en cada scroll/resize/cambio de DOM ============
    if (data.mf === 'track-pins' && parentOrigin === ev.origin) {
      trackedPins = Array.isArray(data.pins) ? data.pins : [];
      reportPinPositions();
      return;
    }
  });

  // Lista de pines a trackear: [{id, selector, xInEl, yInEl, fallbackAbsoluteY, fallbackX}]
  var trackedPins = [];

  function reportPinPositions() {
    if (!parentOrigin) return;
    var positions = trackedPins.map(function(p) {
      try {
        var el = p.selector ? document.querySelector(p.selector) : null;
        if (el) {
          var r = el.getBoundingClientRect();
          // Coords visibles en el viewport actual (relativas al top-left visible del documento)
          var clientX = r.left + (p.xInEl != null ? p.xInEl : 0.5) * r.width;
          var clientY = r.top + (p.yInEl != null ? p.yInEl : 0.5) * r.height;
          return { id: p.id, found: true, clientX: clientX, clientY: clientY };
        }
      } catch(e) {}
      // Fallback a coords absolutas si el selector no existe más
      if (typeof p.fallbackAbsoluteY === 'number') {
        return {
          id: p.id,
          found: false,
          clientX: (p.fallbackX != null ? p.fallbackX : 0.5) * window.innerWidth,
          clientY: p.fallbackAbsoluteY - window.scrollY,
        };
      }
      return { id: p.id, found: false, clientX: null, clientY: null };
    });
    postToParent({ mf: 'pin-positions', positions: positions });
  }

  // ============ Boot ============
  function boot() {
    sendHeartbeat();
    // Re-ping cada 5 min mientras la pestaña esté activa
    setInterval(function(){
      if (document.visibilityState === 'visible') sendHeartbeat();
    }, 5 * 60 * 1000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
`;

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
