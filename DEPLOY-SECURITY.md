# 🛡️ Деплой максимальной защиты сайта КЕРБЕН

Эта инструкция описывает развёртывание новых правил безопасности.
**Делать ШАГ ЗА ШАГОМ, в том порядке как написано** — иначе сайт может временно перестать работать.

---

## Что мы защищаем

| Угроза | До этого деплоя | После |
|---|---|---|
| Хакер удаляет товары / заказы / клиентов через консоль F12 | Возможно | ❌ Невозможно (только админ) |
| Хакер выгружает всю клиентскую базу с паролями | Возможно (`read` открыт + пароли в plaintext) | ❌ Невозможно (нужен auth + пароли как PBKDF2-hash) |
| Хакер изменяет сумму или товары в чужом заказе | Возможно (`update` открыт всем) | ❌ Невозможно (только статус = "Отменён", и только если заказ ещё не доставлен) |
| Хакер перезаписывает чужой профиль (имя, адрес, пароль) | Возможно (`update` открыт всем) | ❌ Невозможно (только владелец `firebaseUid == auth.uid`) |
| Хакер блокирует чужой телефон через `blockedClients` | Возможно | ❌ Невозможно (только админ) |
| Хакер читает финансовые отчёты | Возможно | ❌ Невозможно (только админ через email-логин) |
| Хакер читает чужие пароли в БД | Возможно (открытым текстом) | ❌ Невозможно (PBKDF2 + соль + 100k итераций) |
| Хакер шлёт спам через `notificationQueue` | Частично возможно | ❌ Read закрыт, валидация типов |
| Хакер изменяет чужие сообщения чата | Возможно | ❌ Только поле `read` (admin может всё) |

---

## ШАГ 1. Firebase Console — Authentication

1. Открой [Firebase Console → Authentication → Sign-in method](https://console.firebase.google.com)
2. Включи **Anonymous** (если ещё не включено) — для всех клиентов
3. Включи **Email/Password** — для админа
4. Authentication → **Users** → **Add user** → создай:
   - email: `admin@kerben.local`
   - password: **тот же пароль, который используешь как админ на сайте**

---

## Локально на компьютере: не открывай сайт через `file://`

Если адресная строка выглядит как `file:///Users/.../index.html`, Firebase Auth выдаёт:

- **`auth/requests-from-referer-null-are-blocked`**
- **`403` на `accounts:signUp`**

Это нормальная защита Google: без HTTP-реферера анонимный вход блокируется. Код уже **не дёргает** анонимный вход при `file://`, чтобы не засорять консоль ошибками; после публикации **строгих rules** без нормального origin часть функций может не совпасть с продакшеном.

**Как тестировать как на хостинге:**

```bash
cd "/путь/к/папке/сайта"
python3 -m http.server 8080
```

Открой: `http://localhost:8080/index.html`

В Firebase Console → **Authentication** → **Settings** → **Authorized domains**: должен быть **`localhost`** (часто уже есть по умолчанию).

Если на API-ключе в Google Cloud включены ограничения по HTTP referrer — для локальной разработки добавь `localhost/*` или проверяй только на боевом домене.

---

## ШАГ 2. Залить КОД на хостинг

Залить эти файлы (в любом порядке, до изменения rules):

```
js/auth.js              — старт Firebase Auth ASAP, ожидание готовности
js/customer-auth.js     — PBKDF2-хеш паролей, привязка firebaseUid
js/firebase-config.js   — wait-for-auth перед чтением chatMessages
js/order-submit.js      — wait-for-auth перед оформлением заказа
js/order-tracking.js    — wait-for-auth перед поиском заказов по телефону
js/chat.js              — wait-for-auth перед загрузкой сообщений
chat.html               — wait-for-auth в loadMessages
cart.html               — auto-register с PBKDF2-hash + firebaseUid
profile.html            — login/register с hash + миграция legacy
firestore.rules         — НЕ публиковать сейчас, сначала шаг 3
```

⚠️ **`firestore.rules` НЕ загружай в Firebase ещё**. Сейчас деплой только JS/HTML.

---

## ШАГ 3. Подождать «прогрев» (1–2 часа, лучше 1 день)

После шага 2 у клиентов в браузере прогрузится новый код.
- При открытии сайта → автоматически запускается анонимный Firebase Auth.
- При входе клиента → пароль мигрируется из plaintext в PBKDF2-hash.
- При открытии профиля у уже залогиненных → их документ привязывается к `firebaseUid`.

**Чем больше клиентов зайдут с новым кодом перед публикацией rules — тем меньше «помех» при переключении.**

В это время проверь самостоятельно (как админ):
1. Зайди на сайт → залогинься → открой профиль → отредактируй имя/адрес → сохрани. Должно работать.
2. Открой админку → создай тестовый заказ → удали → должно работать.
3. Открой чат с клиентом → отправь сообщение → должно работать.

Если на этапе 2-3 что-то сломалось — звони мне, ДО публикации rules.

---

## ШАГ 4. Сделать админ-вход (важно!)

**Один раз** залогинься на сайте как админ ПОСЛЕ деплоя нового кода:
- Открой сайт → Профиль → «Вход для админа» → введи свой админ-пароль
- В консоли (F12) ты должен увидеть: `[Kerben Auth] админ вошёл: admin@kerben.local`
- Если видишь `Firebase Auth не активен` — значит в Firebase Console не создан
  email-аккаунт админа (вернись к шагу 1).

После этого Firebase сохранит сессию админа в localStorage, и при следующих
визитах ты автоматически будешь под админ-токеном.

---

## ШАГ 5. Опубликовать новые `firestore.rules`

⚠️ **Перед публикацией — сделай резервную копию текущих правил**: открой
`Firebase Console → Firestore Database → Rules`, скопируй ВЕСЬ текст в
блокнот, сохрани как `rules-backup-2026-05-11.txt`. Если что-то пойдёт не
так — скопируешь обратно и опубликуешь.

1. Открой [Firebase Console → Firestore Database → Rules](https://console.firebase.google.com)
2. Замени содержимое на текст из файла `firestore.rules` нашего проекта
3. Нажми **Publish**

---

## ШАГ 6. Проверка после публикации

### Что должно работать
1. Открой сайт в обычной вкладке (как клиент) — каталог должен загружаться.
2. Положи товар в корзину → оформи заказ → должен пройти.
3. Открой профиль (если есть аккаунт) → «Мои заказы» → должны видеться.
4. Открой админку → удали тестовый товар → должно работать.
5. Открой админ-чат → отправь сообщение → удали переписку → должно работать.
6. Открой админ-расходы → должны открываться.

### Что НЕ должно работать (защита включилась)
В обычной вкладке (не админ), открой консоль (F12), выполни:

```js
// 1) Удалить товар — должно дать permission-denied
firebase.firestore().collection('products').doc('TEST').delete()

// 2) Прочитать всех клиентов — должно дать permission-denied (если auth не сделан)
//    и НЕ должно дать пароли в открытом виде, только passwordHash
firebase.firestore().collection('customers').get()
  .then(s => s.forEach(d => console.log(d.id, d.data())))

// 3) Изменить чужой заказ — должно дать permission-denied
firebase.firestore().collection('orders').doc('SOMEID').update({ total: 1 })

// 4) Прочитать финансы — должно дать permission-denied
firebase.firestore().collection('expenses').get()

// 5) Заблокировать кого-то — должно дать permission-denied
firebase.firestore().collection('blockedClients').doc('+996555111222')
  .set({ blockedBy: 'admin', blockedAt: Date.now() })
```

Все 5 пунктов должны выдать **`Missing or insufficient permissions`**.

---

## Что осталось как «следующая итерация»

### 🟡 Чистка старых plaintext-паролей в БД (ПОСЛЕ миграции всех клиентов)

Через 2-4 недели после деплоя, когда большинство клиентов уже залогинятся
и их пароли мигрируют в hash, можно удалить остаточные plaintext-пароли.
Запусти в Firebase Console → Firestore → Cloud Functions:

```js
// Скрипт удаления legacy password у всех клиентов с passwordHash
const docs = await db.collection('customers').get();
const batch = db.batch();
let count = 0;
docs.forEach(d => {
  const data = d.data();
  if (data.password && data.passwordHash) {
    batch.update(d.ref, { password: firebase.firestore.FieldValue.delete() });
    count++;
  }
});
await batch.commit();
console.log('Cleaned', count, 'legacy passwords');
```

### 🟡 App Check (защита от ботов)

Когда все стабильно работает, включи App Check + reCAPTCHA v3:
- Это привязывает Firebase-токены к легитимным браузерам
- Боты с подделкой anonymous auth получают `unverified-app-token`
- В rules можно требовать `request.auth.token.app_check_token != null`

Подробности: [Firebase App Check docs](https://firebase.google.com/docs/app-check)

### 🟡 Budget Alert в Google Cloud (5 минут)

Чтобы Firestore никогда не «съел» бюджет:
1. [Google Cloud Console → Billing → Budgets & alerts](https://console.cloud.google.com)
2. Create budget → название «Kerben monthly»
3. Amount: $30 в месяц
4. Threshold rules: 50%, 90%, 100% — на email
5. Save

---

## Если что-то сломалось

Симптомы и решения:

| Симптом | Причина | Решение |
|---|---|---|
| `Missing or insufficient permissions` при открытии любой страницы | Anonymous Auth не включён в Console | Включи Anonymous в Firebase Console → Authentication → Sign-in method |
| Клиенты не могут войти | Email/Password не включён или нет email-аккаунта админа | Включи Email/Password, создай `admin@kerben.local` |
| Клиент не может сохранить новый адрес в профиле | У старого клиента нет `firebaseUid` в БД | Клиент должен один раз залогиниться (это привяжет uid). Или временно откати rules |
| Админ не может удалить товар/заказ | Админ не залогинен через email | Сделай шаг 4 заново (Профиль → Вход для админа) |
| Что-то из админки даёт permission-denied | Админ-email отличается от `admin@kerben.local` в rules | Либо измени email в rules (`isAdminUser()`), либо создай в Console пользователя с `admin@kerben.local` |

В крайнем случае — ОТКАТИ rules: `Firebase Console → Firestore → Rules → History → выбери предыдущую версию → Publish`.

---

Готово. Если все 6 шагов прошли успешно — у тебя сейчас один из самых
защищённых B2B-сайтов на Firestore из тех, что я видел. Хакер с
admin-консолью браузера больше ничего не сможет сделать.
