#!/usr/bin/env node
// Проверить ограничения API-ключа AIzaSyBRQ6hH7kXq7ApJmqbvTG1EQsXwxWEnaGg

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
const PROJECT_ID = 'svoysayet';
const API_KEY = 'AIzaSyBRQ6hH7kXq7ApJmqbvTG1EQsXwxWEnaGg';

const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

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

  // 1. Список всех API keys в проекте
  const listRes = await fetch(
    `https://apikeys.googleapis.com/v2/projects/${PROJECT_ID}/locations/global/keys`,
    { headers: { Authorization: 'Bearer ' + access_token } }
  );
  const listBody = await listRes.json();

  if (!listRes.ok) {
    console.error('❌ Не удалось получить список ключей:', listBody);
    return;
  }

  const keys = listBody.keys || [];
  console.log(`📋 API-ключей в проекте: ${keys.length}\n`);

  // 2. Найдём наш ключ и покажем его ограничения
  for (const key of keys) {
    console.log(`Название: ${key.displayName || 'без названия'}`);
    console.log(`ID: ${key.name}`);
    console.log(`UID: ${key.uid || '—'}`);
    console.log(`KeyString (первые 20 символов): ${(key.keyString || '').slice(0, 20)}...`);

    const restrictions = key.restrictions || {};

    // Application restrictions
    if (restrictions.browserKeyRestrictions) {
      console.log('  🌐 Application restrictions: HTTP referrers');
      const referrers = restrictions.browserKeyRestrictions.allowedReferrers || [];
      referrers.forEach(r => console.log(`      - ${r}`));
    } else if (restrictions.serverKeyRestrictions) {
      console.log('  🌐 Application restrictions: IP addresses');
    } else if (restrictions.androidKeyRestrictions) {
      console.log('  🌐 Application restrictions: Android apps');
    } else if (restrictions.iosKeyRestrictions) {
      console.log('  🌐 Application restrictions: iOS apps');
    } else {
      console.log('  🌐 Application restrictions: NONE (ключ работает откуда угодно)');
    }

    // API restrictions
    if (restrictions.apiTargets && restrictions.apiTargets.length > 0) {
      console.log('  🔒 API restrictions: только эти API:');
      restrictions.apiTargets.forEach(t => console.log(`      - ${t.service}`));
    } else {
      console.log('  🔒 API restrictions: NONE (ключ работает со всеми API)');
    }

    console.log('');
  }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
