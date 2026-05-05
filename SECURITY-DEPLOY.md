# 🔐 КЕРБЕН — план развёртывания безопасности

Этот документ — **ваша пошаговая инструкция**. Сделайте всё по порядку.

---

## ✅ Что уже сделано в коде (мной)

- [x] Создан `.gitignore` — теперь секреты не попадут в Git/GitHub.
- [x] Создан `storage.rules` — Firebase Storage защищён (только картинки до 5 МБ, любые другие файлы заблокированы).
- [x] Обновлён `firestore.rules` — добавлена валидация всех записей, защита от:
  - документов-монстров (DoS),
  - отрицательных/гигантских цен,
  - спама в `notificationQueue`,
  - повышения чужого аккаунта до `isAdmin: true`,
  - заказов от заблокированных клиентов.
- [x] Создана **Cloud Function `telegramProxy`** — теперь Telegram-токен лежит на бэкенде в Secret Manager, в коде сайта/GitHub его **больше нет**.
- [x] Создан `js/telegram-client.js` — клиентский хелпер, заменяет прямые вызовы `api.telegram.org`.
- [x] Все 9 файлов с упоминанием токена обновлены — токена нет нигде кроме Cloud Function.
- [x] Удалён дубликат `js/js/customer-auth.js`.

---

## 🚨 ШАГ 1: Сейчас же отзовите старый Telegram-токен

Старый токен `7599592948:AAGt…` уже **скомпрометирован** (был в коде сайта 5+ месяцев, любой посетитель мог его увидеть через `F12`).

1. Откройте Telegram → найдите `@BotFather`.
2. Отправьте команду `/revoke`.
3. Выберите вашего бота.
4. BotFather пришлёт **новый токен** вида `7599592948:AAEx...`.
5. **Сохраните его рядом** — он понадобится в Шаге 3.

После `/revoke` старый токен мгновенно перестаёт работать. Любой хакер с украденным токеном останется ни с чем.

---

## 🚨 ШАГ 2: Установите Firebase CLI (если ещё нет)

Откройте PowerShell и выполните:

```powershell
npm install -g firebase-tools
firebase login
```

Войдите в Google-аккаунт `svoysayet` (тот же, где Firebase Console).

Перейдите в папку проекта:

```powershell
cd C:\Users\hp\Desktop\meloch
```

---

## 🚨 ШАГ 3: Положите новый токен в Firebase Secret Manager

```powershell
cd functions
npm install
cd ..
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
```

Когда попросит ввести значение — **вставьте новый токен** от BotFather (без пробелов и кавычек). Нажмите Enter.

Токен зашифрован и хранится в Google Cloud Secret Manager. В коде/GitHub его нет.

---

## 🚨 ШАГ 4: Деплой всего

```powershell
firebase deploy --only firestore:rules,storage,functions
```

Что задеплоится:
- **Firestore Rules** — новая валидация.
- **Storage Rules** — защита от загрузки лишних файлов.
- **Cloud Functions** — добавляется новая функция `telegramProxy`.

После деплоя зайдите в Firebase Console → Functions → должна появиться `telegramProxy`. Скопируйте её URL — она должна быть `https://us-central1-svoysayet.cloudfunctions.net/telegramProxy`.

Если регион **другой** (например `europe-west1`) — скажите мне, я поправлю URL в `js/telegram-client.js`.

---

## 🚨 ШАГ 5: Проверка

1. Откройте сайт в режиме инкогнито.
2. Сделайте тестовый заказ — должно прийти уведомление в Telegram.
3. Откройте `F12 → Sources` → найдите `orders.js`, `profile.html` — токена нигде нет.
4. Откройте `F12 → Network` при отправке заказа — увидите запрос на `cloudfunctions.net/telegramProxy`, а не на `api.telegram.org`.

---

## 📊 Что НЕ исправлено пока (на потом)

### 1. ImgBB API ключи

В `admin-products.html` и `js/product-loader.js` всё ещё есть ImgBB ключи. Они **публичные**, но позволяют пользоваться вашим лимитом (32 МБ/запрос, бесплатно).

**Защита:**
- Зайдите на [imgbb.com](https://api.imgbb.com/) → войдите в аккаунт.
- В настройках API можно ограничить **Referer** (только ваш домен).
- Это меньше критично, чем Telegram-токен.

ИЛИ давайте я перенесу загрузку картинок на **Firebase Storage** (она у вас уже частично используется в `js/upload.js`). Тогда ImgBB вообще не нужен.

### 2. Слабый автопароль клиентов

В `js/customer-auth.js`:
```js
autoPassword = normalizedPhone.slice(-4)
```

Зная телефон клиента, любой залезет в его кабинет. Нужно:
- Хешировать пароль (как для админа уже сделано).
- Или включить Firebase Authentication с SMS-OTP.

### 3. Нет Firebase Authentication

Без неё нельзя по-настоящему отделить админа от клиента в Firestore Rules. Сейчас злоумышленник всё ещё может прочитать все заказы / клиентов через прямой API-запрос. Включить:
- Firebase Console → Authentication → Sign-in method → Email/Password (для админа).
- Firebase Console → Authentication → Sign-in method → Anonymous (для клиентов).

После этого я перепишу правила и админ-панель — будет полностью закрыто.

### 4. App Check

Зайдите в Firebase Console → App Check → Get started.
- Включите **reCAPTCHA v3** для веб-приложения.
- Получите ключ сайта.
- Добавим в `firebase-config.js` 5 строк — после этого **только запросы с вашего сайта** смогут читать Firestore/Storage. Боты и скрипты — нет.

---

## 💸 Оптимизация расходов (отдельная задача)

После того как разберёмся с безопасностью, я могу:
- Добавить кэш товаров в `localStorage` — чтения Firestore упадут в 5–10 раз.
- Заменить `onSnapshot` на чат на лёгкую проверку — расход FCM упадёт.
- Сжать картинки через `wsrv.nl` — трафик Storage упадёт.

После этого ваш счёт Firebase должен быть **$1–3/мес** или **$0** (внутри free tier).

---

## ❓ Что делать если что-то сломалось

- **Telegram-уведомления не приходят** → проверьте Functions logs:
  ```powershell
  firebase functions:log --only telegramProxy
  ```
- **CORS-ошибки в браузере** → ваш домен не в списке `ALLOWED_ORIGINS` в `functions/index.js`. Скажите мне, добавлю.
- **Firestore операция не работает** → откройте `F12 → Console`. Если "Missing or insufficient permissions" — какое-то правило слишком строгое, скажите какая операция упала, я поправлю.

---

После завершения деплоя сообщите мне здесь — продолжим с оптимизацией расходов и App Check.
