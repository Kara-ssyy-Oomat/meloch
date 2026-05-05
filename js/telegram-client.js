// ===================================================================
// КЕРБЕН B2B Market — клиентский хелпер для Telegram
// -------------------------------------------------------------------
// ВАЖНО: токена бота в коде сайта БОЛЬШЕ НЕТ.
// Все запросы идут через Cloud Function `telegramProxy`,
// которая хранит токен в Firebase Secret Manager.
//
// Использование:
//   await tgSendMessage({ chat_id: '5567924440', text: '…' })
//   await tgSendDocument({ chat_id, file_name, file_mime, blob, caption })
//   await tgSendPhoto({ chat_id, file_name, file_mime, blob, caption })
// ===================================================================

(function () {
  // URL Cloud Function. Регион us-central1 — по умолчанию для Firebase Functions.
  // Если ваш проект развёрнут в другом регионе — поменяйте здесь.
  const TG_PROXY_URL =
    'https://us-central1-svoysayet.cloudfunctions.net/telegramProxy';

  // ID чатов админов (это публичные числа, в них нет ничего секретного).
  // Хранятся здесь централизованно, чтобы не разбрасывать по 9 файлам.
  window.TELEGRAM_CHAT_IDS = window.TELEGRAM_CHAT_IDS || {
    primary: '5567924440',
    secondary: '246421345'
  };

  // ----------- ХЕЛПЕРЫ -----------

  async function _getAppCheckHeader(forceRefresh) {
    try {
      if (typeof firebase === 'undefined' || !firebase.apps.length) return null;
      if (typeof firebase.appCheck !== 'function') return null;
      var ac = firebase.appCheck();
      var tr = await ac.getToken(!!forceRefresh);
      return tr && tr.token ? tr.token : null;
    } catch (e) {
      return null;
    }
  }

  function _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result || '';
        const idx = dataUrl.indexOf(',');
        resolve(idx >= 0 ? dataUrl.slice(idx + 1) : '');
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function _tgCall(method, payload, timeoutMs) {
    timeoutMs = timeoutMs || 60000;

    if (typeof kerbenAwaitAppCheck === 'function') {
      await kerbenAwaitAppCheck(12000);
    }

    async function oneFetch(appCheckTok, signal) {
      var headers = { 'Content-Type': 'application/json' };
      if (appCheckTok) headers['X-Firebase-AppCheck'] = appCheckTok;
      return fetch(TG_PROXY_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(Object.assign({ method: method }, payload)),
        signal: signal
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let appTok = await _getAppCheckHeader(false);
      let response = await oneFetch(appTok, controller.signal);

      let text = await response.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }

      if (
        response.status === 401 &&
        json &&
        (json.error === 'missing_app_check' || json.error === 'invalid_app_check')
      ) {
        if (typeof kerbenAwaitAppCheck === 'function') await kerbenAwaitAppCheck(3000);
        appTok = await _getAppCheckHeader(true);
        response = await oneFetch(appTok, controller.signal);
        text = await response.text();
        json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e2) { /* not JSON */ }
      }

      if (!response.ok) {
        const msg = (json && (json.error || json.description)) || ('HTTP ' + response.status);
        const err = new Error('telegramProxy: ' + msg);
        err.status = response.status;
        err.body = json;
        throw err;
      }

      return json || {};
    } finally {
      clearTimeout(timer);
    }
  }

  // ----------- ПУБЛИЧНОЕ API -----------

  window.tgSendMessage = async function (opts) {
    if (!opts || !opts.chat_id || !opts.text) {
      throw new Error('tgSendMessage: chat_id and text required');
    }
    return _tgCall('sendMessage', {
      chat_id: opts.chat_id,
      text: String(opts.text),
      parse_mode: opts.parse_mode || 'Markdown'
    });
  };

  window.tgSendDocument = async function (opts) {
    if (!opts || !opts.chat_id || !opts.blob) {
      throw new Error('tgSendDocument: chat_id and blob required');
    }
    const base64 = await _blobToBase64(opts.blob);
    return _tgCall('sendDocument', {
      chat_id: opts.chat_id,
      caption: opts.caption || '',
      file_base64: base64,
      file_name: opts.file_name || 'file.bin',
      file_mime: opts.file_mime || (opts.blob.type || 'application/octet-stream')
    });
  };

  window.tgSendPhoto = async function (opts) {
    if (!opts || !opts.chat_id || !opts.blob) {
      throw new Error('tgSendPhoto: chat_id and blob required');
    }
    const base64 = await _blobToBase64(opts.blob);
    return _tgCall('sendPhoto', {
      chat_id: opts.chat_id,
      caption: opts.caption || '',
      file_base64: base64,
      file_name: opts.file_name || 'photo.jpg',
      file_mime: opts.file_mime || (opts.blob.type || 'image/jpeg')
    });
  };
})();
