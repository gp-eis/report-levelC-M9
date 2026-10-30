(function (global) {
  'use strict';

  const scriptUrl = document.currentScript?.src || new URL('../shared/recorded-narration.js', document.baseURI).href;
  const defaultManifestUrl = new URL('sunny-narration-v2.json', scriptUrl).href;
  const normalizeText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

  function create(options = {}) {
    const manifestUrl = new URL(options.manifestUrl || defaultManifestUrl, scriptUrl).href;
    const fetcher = options.fetch || global.fetch?.bind(global);
    const AudioPlayer = options.Audio || global.Audio;
    let epoch = 0, active = null, pageActive = true, destroyed = false;

    const ready = Promise.resolve().then(async () => {
      if (!fetcher) return new Map();
      try {
        const response = await fetcher(manifestUrl, { cache: 'no-store' });
        if (!response.ok) return new Map();
        const data = await response.json();
        if (data?.version !== 2 || data.profileId !== 'gp-sunny-v2' || !Array.isArray(data.entries)) return new Map();
        const held = new Set((data.pendingTexts || []).map(normalizeText));
        const entries = new Map();
        for (const entry of data.entries) {
          const text = normalizeText(entry.text);
          if (!text || text !== entry.text || held.has(text) || entries.has(text)
              || !digest(entry.textSha256) || !digest(entry.audioSha256) || typeof entry.url !== 'string') return new Map();
          const url = new URL(entry.url, manifestUrl);
          if (url.origin !== new URL(manifestUrl).origin || !/^https?:$/.test(url.protocol)
              || !/\.mp3$/i.test(url.pathname) || url.search || url.hash) return new Map();
          entries.set(text, { url: url.href, textSha256: entry.textSha256, audioSha256: entry.audioSha256 });
        }
        return entries;
      } catch (_) {
        return new Map();
      }
    });

    function foreground() { return !destroyed && pageActive && !document.hidden; }
    function cancel() {
      epoch += 1;
      active?.finish(false, 'cancelled');
    }

    function speak(value, hooks = {}) {
      cancel();
      const text = normalizeText(value), token = epoch;
      if (!text || !foreground()) return Promise.resolve(false);
      return new Promise(resolve => {
        const operation = { text, audio: null, cancelFallback: null, done: false, timer: null, finish };
        active = operation;
        function current() { return !operation.done && token === epoch && active === operation && foreground(); }
        function finish(success, reason) {
          if (operation.done) return;
          const wasCurrent = token === epoch && active === operation;
          operation.done = true;
          clearTimeout(operation.timer);
          if (active === operation) active = null;
          if (operation.audio) {
            operation.audio.onplay = operation.audio.onended = operation.audio.onerror = null;
            if (!success) {
              operation.audio.pause();
              try { operation.audio.currentTime = 0; } catch (_) { /* Metadata can still be loading. */ }
            }
          }
          if (!success && operation.cancelFallback) operation.cancelFallback();
          if (wasCurrent && reason === 'ended') hooks.onend?.();
          else if (wasCurrent && reason === 'error') hooks.onerror?.();
          hooks.onfinish?.({ success, reason });
          resolve(Boolean(success && wasCurrent));
        }
        function startFallback() {
          if (!current()) return;
          if (typeof hooks.fallback !== 'function') { finish(false, 'error'); return; }
          try {
            const stop = hooks.fallback({
              onstart() { if (current()) hooks.onstart?.(); else operation.cancelFallback?.(); },
              onend() { if (current()) finish(true, 'ended'); },
              onerror() { if (current()) finish(false, 'error'); }
            });
            if (typeof stop === 'function') operation.cancelFallback = stop;
            if (!current()) operation.cancelFallback?.();
          } catch (_) { finish(false, 'error'); }
        }
        operation.timer = setTimeout(() => finish(false, 'error'), 45000);
        ready.then(entries => {
          if (!current()) return;
          const entry = entries.get(text);
          if (!entry || typeof AudioPlayer !== 'function') { startFallback(); return; }
          try {
            const audio = operation.audio = new AudioPlayer(entry.url);
            audio.preload = 'auto'; audio.volume = 1;
            audio.onplay = () => {
              if (!current()) { audio.pause(); return; }
              hooks.onstart?.();
            };
            audio.onended = () => { if (current()) finish(true, 'ended'); };
            audio.onerror = () => { if (current()) finish(false, 'error'); };
            Promise.resolve(audio.play()).then(() => {
              if (!current()) audio.pause();
            }).catch(() => {
              // A blocked or failed recorded play never starts a delayed browser voice.
              if (current()) finish(false, 'error');
              else audio.pause();
            });
          } catch (_) { if (current()) finish(false, 'error'); }
        });
      });
    }

    const hidden = () => { if (document.hidden) cancel(); };
    const hide = () => { pageActive = false; cancel(); };
    const show = () => { pageActive = true; };
    document.addEventListener('visibilitychange', hidden);
    global.addEventListener('pagehide', hide);
    global.addEventListener('pageshow', show);
    return Object.freeze({
      speak, cancel, ready: ready.then(entries => ({ approvedEntries: entries.size })),
      destroy() {
        destroyed = true; cancel();
        document.removeEventListener('visibilitychange', hidden);
        global.removeEventListener('pagehide', hide);
        global.removeEventListener('pageshow', show);
      }
    });
  }

  global.GPReportNarration = Object.freeze({ create, normalizeText });
})(window);
