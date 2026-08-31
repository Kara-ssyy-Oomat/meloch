# 🔧 Инструкция: что делать если сайт не работает / вход в профиль не открывается

Эта инструкция описывает **все возможные причины поломки Firebase** и **как их починить пошагово**. Используй её когда сайт перестал работать, клиенты не могут войти на профиль, или в консоли появились массовые 403-ошибки.

---

## 📋 Быстрая диагностика (2 минуты)

**Как понять что именно сломалось:**

1. Открой сайт → нажми `F12` → вкладка `Console`
2. Обнови страницу (`Cmd+R` / `Ctrl+R`)
3. Посмотри на красные строки

### Признаки типовых проблем

| Что видишь в консоли | Что это значит | Куда переходить |
|---|---|---|
| `Requests to this API firebaseinstallations.googleapis.com are blocked` | Firebase Installations API отключён | → [Проблема 1](#-проблема-1-firebase-installations-api-отключён) |
| `identitytoolkit/v3/relyingparty ... 403` | Ограничения на API-ключе | → [Проблема 2](#-проблема-2-ограничения-на-api-ключе) |
| `Missing or insufficient permissions` (все запросы) | Firebase Auth не работает → цепочка | → [Проблема 1](#-проблема-1-firebase-installations-api-отключён) сначала |
| `firestore.googleapis.com/... 403` | То же — обычно последствие Проблемы 1 | → [Проблема 1](#-проблема-1-firebase-installations-api-отключён) |
| `quota exceeded` / `429 Too Many Requests` | Превышена квота | → [Проблема 3](#-проблема-3-исчерпана-квота) |
| Красный баннер в Google Cloud Console «Project suspended» | Биллинг проблема | → [Проблема 4](#-проблема-4-проблемы-с-биллингом) |

---

## 🔴 Проблема 1: Firebase Installations API отключён

**Самая частая проблема!** Проявляется массовыми 403 на все Google APIs одновременно.

### Что это

`firebaseinstallations.googleapis.com` — **фундамент** Firebase. Без него не работает **НИЧЕГО**:
- ❌ Firebase Auth (вход/регистрация)
- ❌ Firestore (чтение данных)
- ❌ Push-уведомления
- ❌ Cloud Functions вызовы

Как только этот API даёт 403 — рушится вся цепочка запросов.

### Как проверить

Открой:
```
https://console.cloud.google.com/apis/library/firebaseinstallations.googleapis.com?project=svoysayet
```

**Что увидеть:**
- 🔴 Синяя кнопка **«ENABLE»** → **это и есть причина!**
- 🟢 «API enabled» → значит проблема в другом, смотри [Проблема 2](#-проблема-2-ограничения-на-api-ключе)

### Как починить

1. На той же странице нажми **синюю кнопку «Enable»**
2. Подожди **2-3 минуты** пока Google применит изменения
3. Открой сайт с полной перезагрузкой (**`Cmd+Shift+R`** на Mac, **`Ctrl+Shift+F5`** на Windows)
4. Открой F12 → Console → проверь что 403 пропали
5. Попробуй войти на профиль

### Заодно проверь также

Эти API тоже должны быть включены. Открой каждую ссылку и убедись что там кнопка не «Enable», а надпись «API enabled»:

- Identity Toolkit API: https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com?project=svoysayet
- Token Service API: https://console.cloud.google.com/apis/library/sts.googleapis.com?project=svoysayet
- Cloud Firestore API: https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=svoysayet
- Firebase Cloud Messaging API: https://console.cloud.google.com/apis/library/fcm.googleapis.com?project=svoysayet
- Firebase Cloud Functions: https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=svoysayet

---

## 🟡 Проблема 2: Ограничения на API-ключе

Проявляется если Firebase Installations API включён, но всё равно 403.

### Что это

У API-ключа Google могут быть ограничения по:
- **HTTP referrers** — с каких доменов разрешено использовать ключ
- **API restrictions** — какие Google APIs ключ может вызывать

Если домен твоего сайта не в списке или нужный API не в списке — Google возвращает 403.

### Как проверить и починить

1. Открой:
   ```
   https://console.cloud.google.com/apis/credentials?project=svoysayet
   ```

2. Найди API-ключ `AIzaSyBRQ6hH7kXq7ApJmqbvTG1EQsXwxWEnaGg` в списке → нажми **✏️ (карандаш редактирования)**

3. **Секция «Application restrictions»**:
   - Правильно: **HTTP referrers (web sites)**
   - В списке должны быть:
     ```
     https://kara-ssyy-oomat.github.io/*
     https://*.github.io/*
     http://localhost/*
     http://localhost:*/*
     ```
   - Или временно поставить **None** (для отладки — потом верни обратно!)

4. **Секция «API restrictions»**:
   - Правильно: **Restrict key**
   - В списке разрешённых API должны быть все эти:
     - ✅ Cloud Firestore API
     - ✅ Firebase Installations API
     - ✅ Identity Toolkit API
     - ✅ Token Service API
     - ✅ Firebase Cloud Messaging API
     - ✅ Firebase Rules API
     - ✅ Cloud Functions API
     - ✅ Firebase Storage API
     - ✅ Google Identity Toolkit API (старый, deprecated, но иногда ещё нужен)
   - Или временно поставить **Don't restrict key**

5. Нажми **Save** внизу страницы

6. Подожди **2-3 минуты**

7. Обнови сайт с `Cmd+Shift+R`

⚠️ **Внимание:** «Don't restrict key» + «None» на постоянку **опасно** — ключ смогут использовать где угодно (например, злоумышленники украдут его из твоего JS-кода и подключат к своему сайту, генерируя тебе счёт за трафик). Правильно — ограничить ключ по домену и API как описано выше.

---

## 🟠 Проблема 3: Исчерпана квота

Актуально только на **бесплатном плане Spark** (у нас платный **Blaze**, но на всякий случай).

### Что это

Firebase Free Tier имеет дневные лимиты:

| Ресурс | Лимит в день |
|---|---|
| Firebase Auth (анонимных входов) | 100 в час, 1000 в день |
| Firestore чтения | 50 000 |
| Firestore записи | 20 000 |
| Firestore удаления | 20 000 |
| Cloud Functions вызовы | 125 000 |
| Cloud Functions вычислений | 40 000 ГБ×сек |

Если лимит выжмется — все запросы дают 403 до 00:00 по Pacific Time (это ~13:00 дня по Бишкеку).

### Как проверить

Открой:
```
https://console.firebase.google.com/project/svoysayet/usage
```

Смотри графики использования. Если что-то упёрлось в максимум красным цветом — вот причина.

### Как починить

- **Быстро:** подождать до 13:00 (обнулится за сутки)
- **Правильно:** перейти на план **Blaze** (у нас уже он) — квоты становятся почти безграничными, платишь только за реальное использование

---

## 🟣 Проблема 4: Проблемы с биллингом

На плане Blaze, если биллинг-аккаунт заблокирован (карта отклонена, spending cap достигнут, аккаунт приостановлен) → все API мгновенно возвращают 403.

### Как проверить

Открой:
```
https://console.cloud.google.com/billing/linkedaccount?project=svoysayet
```

**Что должно быть:**
- ✅ Billing account status: **Active** (Активен)
- ✅ Никаких красных баннеров сверху страницы

**Что может быть не так:**
- 🔴 Баннер «Project suspended due to billing issues» → нужно оплатить/обновить карту
- 🔴 Баннер про Budget Alert → достигли установленного лимита расходов
- 🔴 «Billing disabled» → биллинг вообще отключён от проекта

### Как починить

Зависит от конкретной ошибки:
1. **Карта** — обновить платёжный метод в https://console.cloud.google.com/billing
2. **Budget Alert** — поднять лимит или временно снять
3. **Suspended project** — оплатить долг, потом перезапустить проект

---

## 🎯 Универсальный порядок действий когда сайт сломался

Делай в этом порядке, каждый шаг занимает 1-2 минуты:

### Шаг 1: Firebase Installations API
```
https://console.cloud.google.com/apis/library/firebaseinstallations.googleapis.com?project=svoysayet
```
Если «Enable» — жми её. Ждём 2 минуты. Проверяем сайт.

### Шаг 2: Ограничения API-ключа
```
https://console.cloud.google.com/apis/credentials?project=svoysayet
```
Открой ключ → временно поставь Application restrictions=None, API restrictions=Don't restrict → Save.
Ждём 2 минуты. Проверяем сайт. Потом верни правильные ограничения (см. Проблема 2).

### Шаг 3: Биллинг
```
https://console.cloud.google.com/billing/linkedaccount?project=svoysayet
```
Смотрим не приостановлен ли аккаунт.

### Шаг 4: Квоты (только если Spark)
```
https://console.firebase.google.com/project/svoysayet/usage
```
Смотрим на графики.

### Шаг 5: Логи ошибок
```
https://console.cloud.google.com/apis/dashboard?project=svoysayet
```
Кликаем на каждый Firebase-API и смотрим что за ошибки. Google обычно даёт точную причину.

---

## 🛡️ Как избежать повторения проблемы

### 1. Настрой Budget Alerts

Автоматические уведомления когда расходы или использование растут:
```
https://console.cloud.google.com/billing/budgets
```
Ставь порог, например $10/день → приходит email/SMS.

### 2. Включи App Check (когда получится с reCAPTCHA)

Защищает от того чтобы твой API-ключ использовали злоумышленники. Заготовка есть в `js/app-check.js`, сейчас закомментирована из-за проблем с reCAPTCHA. Когда домен нормально зарегистрируешь в https://www.google.com/recaptcha/admin → можно раскомментировать код в `kerbenStartAppCheckSetup()`.

### 3. Не оставляй API-ключ без ограничений

Всегда оставляй правильные ограничения на ключ (см. Проблема 2), чтобы никто не мог использовать твой ключ с чужого сайта.

### 4. Регулярно проверяй uptime

Раз в неделю открывай:
```
https://console.cloud.google.com/apis/dashboard?project=svoysayet
```
Смотри график ошибок за последние 7 дней. Если растёт — реагируй сразу, не жди пока клиенты пожалуются.

---

## 📞 Куда обращаться если ничего не помогает

1. **Firebase Support** (для Blaze плана): https://firebase.google.com/support
2. **Google Cloud Support**: https://console.cloud.google.com/support
3. **Stack Overflow с тегом [firebase]** — комьюнити помогает быстро

---

## 🚨 Что делать пока Firebase не работает (в коде мы это уже учли)

Наш сайт **частично работает** даже при 403 благодаря нашим фиксам:

| Функция | Работает без Firebase? |
|---|---|
| Просмотр товаров (закэшированные) | ✅ Да, через Service Worker |
| Добавление в корзину | ✅ Да, локально |
| Оформление заказа | ✅ Да, через `orderNotify` Cloud Function (обходит Auth) |
| Уведомление в Telegram | ✅ Да |
| **Автовход в профиль после заказа** | ✅ Да (наш фикс `a2f7b5c`) |
| Обновление списка товаров | ❌ Нет |
| Список заказов в профиле | ❌ Нет |
| Чат с админом | ❌ Нет |
| Регистрация нового пользователя через логин | ❌ Нет |

Так что даже когда Firebase сломан — сайт **не мёртвый**, клиенты могут заказать и попасть в профиль. Только «продвинутые» функции недоступны.

---

## 📚 Полезные ссылки

- **Firebase Console:** https://console.firebase.google.com/project/svoysayet
- **Google Cloud Console:** https://console.cloud.google.com/home/dashboard?project=svoysayet
- **APIs Dashboard:** https://console.cloud.google.com/apis/dashboard?project=svoysayet
- **Credentials:** https://console.cloud.google.com/apis/credentials?project=svoysayet
- **Billing:** https://console.cloud.google.com/billing?project=svoysayet
- **Firestore Rules:** https://console.firebase.google.com/project/svoysayet/firestore/rules
- **Firebase Auth Users:** https://console.firebase.google.com/project/svoysayet/authentication/users

---

## 📝 История правок в коде

Последние коммиты которые улучшают устойчивость сайта к таким сбоям:

- `2b64a0d` — logout не блокирует повторный вход в профиль агента
- `8a95726` — подсказки клиентов агента подгружаются из Firestore прямо в форме заказа
- `127e914` — правильный мёрж клиентов агента из облака (не затирают локальные правки)
- `a2f7b5c` — customerData сохраняется локально ДО Firestore-попыток → профиль открывается автоматически после заказа даже при 403 от Firebase

---

*Обновлено: 31 августа 2026*
