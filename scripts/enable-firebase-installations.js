#!/usr/bin/env node
// ===================================================================
// Одноразовый скрипт: включает Firebase Installations API (и другие
// критичные для сайта Google APIs) в проекте svoysayet, используя
// авторизацию Firebase CLI (~/.config/configstore/firebase-tools.json).
//
// НЕ КОММИТИТЬ секреты. Скрипт читает refresh_token локально, обновляет
// access_token через OAuth и вызывает Service Usage API.
// ===================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
const PROJECT_ID = 'svoysayet';

// Firebase CLI использует эти "installed app" OAuth credentials.
// Они публичны (прямо в open-source коде firebase/firebase-tools).
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// APIs которые должны быть включены для нормальной работы сайта.
const APIS_TO_ENABLE = [
  'firebaseinstallations.googleapis.com', // ⚡ Главный виновник 403
  'identitytoolkit.googleapis.com',       // Firebase Auth
  'sts.googleapis.com',                   // Token Service
  'firestore.googleapis.com',             // Firestore
  'firebaseappcheck.googleapis.com',      // App Check (опционально)
  'fcm.googleapis.com',                   // Cloud Messaging (push)
  'firebase.googleapis.com'               // Firebase Management
];

async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Refresh failed: HTTP ' + res.status + ' — ' + text.slice(0, 200));
  }

  return await res.json();
}

async function getApiState(accessToken, apiName) {
  const url = `https://serviceusage.googleapis.com/v1/projects/${PROJECT_ID}/services/${apiName}`;
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  if (!res.ok) {
    return { state: 'UNKNOWN', error: await res.text() };
  }
  return await res.json();
}

async function enableApi(accessToken, apiName) {
  const url = `https://serviceusage.googleapis.com/v1/projects/${PROJECT_ID}/services/${apiName}:enable`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to enable ${apiName}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  console.log('📖 Читаем Firebase CLI config...');
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error('Firebase CLI config не найден: ' + CONFIG_PATH);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  if (!config.tokens || !config.tokens.refresh_token) {
    throw new Error('Refresh token не найден в конфиге. Запусти "firebase login".');
  }

  const account = (config.user && config.user.email) || 'unknown';
  console.log(`🔑 Авторизован как: ${account}`);
  console.log(`🎯 Проект: ${PROJECT_ID}\n`);

  console.log('🔄 Обновляем access_token через refresh_token...');
  const tokenResp = await refreshAccessToken(config.tokens.refresh_token);
  const accessToken = tokenResp.access_token;
  console.log('✅ Access token получен (действителен ' + tokenResp.expires_in + ' секунд)\n');

  console.log('📋 Проверяем и включаем API:\n');

  for (const apiName of APIS_TO_ENABLE) {
    process.stdout.write(`  ${apiName.padEnd(40)} ... `);

    const state = await getApiState(accessToken, apiName);

    if (state.state === 'ENABLED') {
      console.log('уже включён ✓');
    } else if (state.state === 'DISABLED') {
      try {
        await enableApi(accessToken, apiName);
        console.log('ВКЛЮЧЁН ✅');
      } catch (err) {
        console.log('ОШИБКА ❌');
        console.log(`    ${err.message}`);
      }
    } else {
      console.log(`неизвестное состояние: ${state.state || 'N/A'}`);
      if (state.error) console.log(`    ${state.error.slice(0, 200)}`);
    }
  }

  console.log('\n🎉 Готово! Подожди 1-2 минуты и открой сайт с полной перезагрузкой (Cmd+Shift+R).');
}

main().catch(err => {
  console.error('\n❌ Ошибка:', err.message);
  process.exit(1);
});
