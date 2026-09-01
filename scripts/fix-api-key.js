#!/usr/bin/env node
// Добавить недостающие API в whitelist API-ключа.
// Сохраняем существующие HTTP referrer ограничения (безопасность).

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
const PROJECT_ID = 'svoysayet';
const KEY_ID = '3b2c35cf-f33b-47cd-bba9-bf5a83b13af9';

const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// Полный список нужных API для нормальной работы сайта.
// Включаем всё что использует Firebase JS SDK v9.x.
const REQUIRED_APIS = [
  'firebase.googleapis.com',
  'firebaseinstallations.googleapis.com',  // ⚡ Была потеряна — главная причина 403
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',            // Refresh tokens Firebase Auth
  'firestore.googleapis.com',
  'fcm.googleapis.com',
  'firebasestorage.googleapis.com',
  'firebaseappcheck.googleapis.com',
  'cloudfunctions.googleapis.com',
  'fpnv.googleapis.com'                    // Firebase Performance/Analytics
];

// HTTP referrers — оставляем такими же (безопасность).
const ALLOWED_REFERRERS = [
  'https://kara-ssyy-oomat.github.io/*',
  'https://kara-ssyy-oomat.github.io/meloch/*'
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
  if (!res.ok) throw new Error('Refresh failed: ' + await res.text());
  return await res.json();
}

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const { access_token } = await refreshAccessToken(config.tokens.refresh_token);

  console.log('🔧 Обновляем ограничения API-ключа...\n');

  const updateBody = {
    restrictions: {
      browserKeyRestrictions: {
        allowedReferrers: ALLOWED_REFERRERS
      },
      apiTargets: REQUIRED_APIS.map(service => ({ service }))
    }
  };

  const url = `https://apikeys.googleapis.com/v2/projects/${PROJECT_ID}/locations/global/keys/${KEY_ID}?updateMask=restrictions`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updateBody)
  });

  const body = await res.json();
  if (!res.ok) {
    console.error('❌ Ошибка обновления:', JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log('✅ API-ключ обновлён. Операция запущена в Google Cloud:');
  console.log(`   Operation: ${body.name}`);
  console.log('\n📋 Новые ограничения:');
  console.log('   🌐 HTTP referrers:');
  ALLOWED_REFERRERS.forEach(r => console.log(`      - ${r}`));
  console.log('   🔒 Разрешённые API:');
  REQUIRED_APIS.forEach(a => console.log(`      - ${a}`));
  console.log('\n⏳ Изменения применятся через 1-2 минуты.');
  console.log('   Затем открой сайт с полной перезагрузкой (Cmd+Shift+R).');
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
