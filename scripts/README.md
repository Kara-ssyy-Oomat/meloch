# 🛠️ Скрипты аварийного управления Firebase

Полезные Node.js-скрипты которые используют **сессию Firebase CLI** (`firebase login`) для управления Google Cloud API проекта `svoysayet` **без доступа к Google Cloud Console** через браузер.

Работают если:
- Установлен `firebase-tools` (обычно есть у разработчика)
- Сделан `firebase login` хотя бы раз ранее
- Refresh token сохранён в `~/.config/configstore/firebase-tools.json`

## Как использовать

```bash
# Из корня проекта
node scripts/enable-firebase-installations.js  # проверить/включить нужные API
node scripts/check-api-key.js                  # посмотреть ограничения API-ключа
node scripts/fix-api-key.js                    # исправить whitelist API-ключа
```

## Что делает каждый скрипт

### `enable-firebase-installations.js`

Проверяет **включены ли** в Google Cloud проекте все необходимые API для работы Firebase:
- Firebase Installations API
- Identity Toolkit API (Firebase Auth)
- STS API (Security Token Service)
- Firestore API
- Firebase App Check API
- Firebase Cloud Messaging API
- Firebase Management API

Если API отключён — включает его. Если включён — оставляет как есть.

**Когда запускать:** если в консоли браузера видишь ошибки типа `Requests to this API ... are blocked`.

### `check-api-key.js`

Показывает **все API-ключи** в проекте и их **ограничения** (HTTP referrers, API restrictions).

**Когда запускать:** для диагностики. Помогает понять правильно ли настроен API-ключ.

### `fix-api-key.js`

Приводит **API-ключ проекта в правильное состояние**:
- HTTP referrers: только `kara-ssyy-oomat.github.io` (безопасность)
- API restrictions: все нужные для сайта API включены

**Когда запускать:** если Google (или кто-то) сузил список разрешённых API у ключа, и на сайте посыпались 403.

## Безопасность

- ⚠️ **Не публикуй свой ~/.config/configstore/firebase-tools.json** — там refresh token, дающий полный доступ к твоим Firebase-проектам
- Скрипты сами по себе **не содержат** секретов — они читают токен локально
- OAuth `client_id`/`client_secret` в коде — публичные (это стандартные Firebase CLI credentials, они в open-source репозитории firebase/firebase-tools)

## История применения

- **31.08.2026** — впервые пришлось использовать, потому что Google автоматически убрал `firebaseinstallations.googleapis.com` и ряд других API из whitelist API-ключа. Все запросы к Firebase начали возвращать 403. Скрипт `fix-api-key.js` восстановил whitelist за 1 минуту.

## Если Firebase CLI не залогинен

```bash
firebase login       # интерактивный вход через браузер
firebase login:list  # проверить какой аккаунт активен
```

После этого скрипты снова заработают.
