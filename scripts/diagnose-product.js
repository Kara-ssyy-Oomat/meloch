#!/usr/bin/env node
// Диагностика конкретного товара: почему клиенты видят его в наличии
// хотя на складе 0.

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
const PROJECT_ID = 'svoysayet';
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// Product ID от которого приходят OVERSELL warnings в логах
const PRODUCT_ID = process.argv[2] || 'gDLQWeBUd3BjcdqeW6zR';

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
  if (!res.ok) throw new Error('Refresh failed');
  return await res.json();
}

async function firestoreGet(accessToken, path) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore GET ${path}: ${res.status} ${body.slice(0, 200)}`);
  }
  return await res.json();
}

async function firestoreList(accessToken, collection) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}`;
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  if (!res.ok) return null;
  return await res.json();
}

function decodeValue(v) {
  if (v == null) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('mapValue' in v) {
    const obj = {};
    const fields = (v.mapValue && v.mapValue.fields) || {};
    for (const k of Object.keys(fields)) obj[k] = decodeValue(fields[k]);
    return obj;
  }
  if ('arrayValue' in v) {
    return ((v.arrayValue && v.arrayValue.values) || []).map(decodeValue);
  }
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}

function decodeDoc(doc) {
  const out = {};
  const fields = (doc && doc.fields) || {};
  for (const k of Object.keys(fields)) out[k] = decodeValue(fields[k]);
  return out;
}

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const { access_token } = await refreshAccessToken(config.tokens.refresh_token);

  console.log(`🔍 Диагностика товара: ${PRODUCT_ID}\n`);

  // 1. Читаем сам товар
  const productDoc = await firestoreGet(access_token, `products/${PRODUCT_ID}`);
  const product = decodeDoc(productDoc);

  console.log('📦 ТОВАР:');
  console.log('   Название:', product.title || '—');
  console.log('   Цена:', product.price || '—');
  console.log('   stock (общий):', product.stock, `(тип: ${typeof product.stock})`);
  console.log('   Категория:', product.category || '—');
  console.log('   Активен:', product.active !== false ? '✅' : '❌');

  console.log('\n📊 warehouseStock:');
  if (product.warehouseStock && typeof product.warehouseStock === 'object') {
    const totalWs = Object.values(product.warehouseStock).reduce((s, v) => s + (Number(v) || 0), 0);
    for (const [whId, qty] of Object.entries(product.warehouseStock)) {
      console.log(`   ${whId}: ${qty}`);
    }
    console.log(`   ─────────────`);
    console.log(`   Сумма по всем складам: ${totalWs}`);
    console.log(`   Совпадает с stock? ${totalWs === product.stock ? '✅' : '❌ РАСХОЖДЕНИЕ!'}`);
  } else {
    console.log('   ⚠️ Нет разбивки по складам — товар использует только общий stock');
  }

  // 2. Читаем настройки складов
  console.log('\n🏭 НАСТРОЙКИ СКЛАДОВ:');
  const settingsDoc = await firestoreGet(access_token, 'settings/warehouse').catch(() => null);
  const settings = settingsDoc ? decodeDoc(settingsDoc) : {};
  console.log('   Пауза системы складов:', settings.paused === true ? '✅ ДА' : '❌ Нет');
  console.log('   Главный склад:', settings.primaryWarehouseId || '(не задан)');

  const warehousesList = await firestoreList(access_token, 'warehouses');
  const warehouses = ((warehousesList && warehousesList.documents) || []).map(d => {
    const id = d.name.split('/').pop();
    return { id, ...decodeDoc(d) };
  });
  console.log(`   Всего складов: ${warehouses.length}`);
  for (const w of warehouses) {
    console.log(`      • ${w.name || w.id} (id=${w.id}, paused=${w.paused === true ? 'ДА ⚠️' : 'нет'})`);
  }

  // 3. Анализ — почему клиент видит товар в наличии
  console.log('\n🔎 АНАЛИЗ:');
  const pausedIds = new Set(warehouses.filter(w => w.paused === true).map(w => w.id));
  const primaryId = settings.primaryWarehouseId;
  const primaryActive = primaryId && !pausedIds.has(primaryId);

  if (product.warehouseStock && Object.keys(product.warehouseStock).length > 0) {
    let sellable = 0;
    if (primaryActive) {
      sellable = Math.max(0, Math.floor(product.warehouseStock[primaryId] || 0));
      console.log(`   Главный склад активен → продаваемое количество = warehouseStock[${primaryId}] = ${sellable}`);
    } else {
      for (const [whId, qty] of Object.entries(product.warehouseStock)) {
        if (pausedIds.has(whId)) continue;
        sellable += Math.max(0, Math.floor(qty || 0));
      }
      console.log(`   Главный склад НЕ активен → продаваемое = сумма НЕзапаузенных = ${sellable}`);
    }
    console.log(`   ${sellable > 0 ? '⚠️ Клиенты ВИДЯТ товар в наличии' : '✅ Клиенты НЕ видят товар'}`);
    if (sellable > 0 && Object.values(product.warehouseStock).every(v => (Number(v) || 0) === 0)) {
      console.log(`   ❌ БАГ: warehouseStock всё нули, а sellable > 0 — не может быть!`);
    }
  } else {
    console.log(`   Товар без warehouseStock, продаётся по общему stock = ${product.stock}`);
    if (typeof product.stock !== 'number' || !isFinite(product.stock)) {
      console.log(`   ❌ ПРОБЛЕМА: stock не число → Cloud Function пропускает списание!`);
    }
  }

  console.log('\n📝 Рекомендации:');
  const ws = product.warehouseStock || {};
  const allZero = Object.keys(ws).length > 0 && Object.values(ws).every(v => (Number(v) || 0) === 0);
  if (allZero && product.stock > 0) {
    console.log('   → ОБНОВИ товар: поставь stock=0, чтобы клиенты перестали заказывать');
  }
  if (product.warehouseStock && product.stock !== Object.values(product.warehouseStock).reduce((s, v) => s + (Number(v) || 0), 0)) {
    console.log('   → РАСХОЖДЕНИЕ между stock и warehouseStock. Нужно синхронизировать');
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
