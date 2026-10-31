# Канал «Пользовательский WebHook»

[简体中文](CUSTOM_WEBHOOK.md) | [繁體中文](CUSTOM_WEBHOOK.zh-TW.md) | [English](CUSTOM_WEBHOOK.en.md) | [Deutsch](CUSTOM_WEBHOOK.de.md) | [Français](CUSTOM_WEBHOOK.fr.md) | [Italiano](CUSTOM_WEBHOOK.it.md) | [日本語](CUSTOM_WEBHOOK.ja.md) | [한국어](CUSTOM_WEBHOOK.ko.md) | [조선어](CUSTOM_WEBHOOK.ko-KP.md) | [Nederlands](CUSTOM_WEBHOOK.nl.md) | [Русский](CUSTOM_WEBHOOK.ru.md)

[← Назад к README](../README.ru.md)

Пункт «Каналы уведомлений → Пользовательский WebHook» позволяет отправлять события мониторинга в формате JSON методом POST на произвольный HTTPS-эндпоинт; это подходит для интеграции с собственными сервисами, платформами автоматизации или шлюзами сообщений.

## Поля конфигурации

| Поле | Обязательно | Описание |
| --- | --- | --- |
| Название | Да | Только для идентификации в системе |
| Адрес WebHook | Да | HTTPS-адрес получателя уведомлений; не должен указывать на локальный компьютер или внутреннюю сеть |
| Ключ подписи HMAC | Нет | Если задан, запрос содержит заголовок подписи для проверки источника и целостности на стороне получателя |
| Заголовок Authorization | Нет | Передаётся как есть в заголовке `Authorization`, например `Bearer <token>` |

> HTTP-адреса и адреса внутренней сети разрешены только при `ALLOW_INSECURE_WEBHOOKS=1` в тестовой среде. В production используйте публичные HTTPS-адреса.

## Формат запроса

Система использует метод `POST`, тело запроса — JSON:

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: SteamGames-Monitor/1.0
X-SGM-Event: sale_start
X-SGM-Timestamp: 1793330000000
X-SGM-Signature: sha256=<hex hmac>
Authorization: Bearer <optional token>
```

Пример Payload события:

```json
{
  "source": "steamgames-monitor",
  "version": 1,
  "kind": "event",
  "eventId": 123,
  "eventType": "sale_start",
  "severity": "info",
  "title": "【促销开始】赛博朋克 2077",
  "text": "【促销开始】赛博朋克 2077\n当前价格：¥149.00（-50%）...",
  "markdown": "**【促销开始】赛博朋克 2077**\n...",
  "html": "<div>...</div>",
  "monitor": {
    "id": 1,
    "appid": 1091500,
    "name": "赛博朋克 2077",
    "storeUrl": "https://store.steampowered.com/app/1091500/",
    "region": "cn",
    "language": "schinese"
  },
  "data": {
    "discountPercent": 50,
    "priceInitialFormatted": "¥298.00",
    "priceFinalFormatted": "¥149.00"
  },
  "createdAt": 1793330000000,
  "timestamp": "2026-10-30T05:00:00.000Z"
}
```

У тестового сообщения `kind` равен `"test"`, поля `eventId`, `eventType`, `severity`, `monitor` равны `null`, а `data` — `{}`.

- `eventType` соответствует типам событий системы, например `release`, `sale_start`, `sale_change`, `sale_end`, `delisting_warning`, `delisted`.
- `data` содержит исходные дополнительные поля события; для разных типов событий набор полей различается.
- Правила фильтрации событий такие же, как у других каналов уведомлений; если события не выбраны, принимаются все события, кроме `check_error`.

## Проверка подписи HMAC

Если задан ключ подписи, система отправляет:

```text
X-SGM-Timestamp: <временная метка в миллисекундах>
X-SGM-Signature: sha256=<hex>
```

Способ вычисления подписи:

```text
hex = HMAC-SHA256(secret, timestamp + "." + rawRequestBody)
```

Пример проверки на Node.js:

```js
import { createHmac, timingSafeEqual } from 'node:crypto'

function verifyWebhook(req, secret) {
  const timestamp = req.headers['x-sgm-timestamp']
  const signature = req.headers['x-sgm-signature']
  if (!timestamp || !signature) return false

  const expected = `sha256=${createHmac('sha256', secret)
    .update(`${timestamp}.${req.rawBody}`)
    .digest('hex')}`

  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}
```

Вычисляйте подпись непосредственно по **исходному телу запроса**, полученному платформой: не десериализуйте и не сериализуйте его повторно. Рекомендуется также ограничивать отклонение временной метки от текущего времени (например, 5 минутами) для защиты от повторного воспроизведения.

## Ответы и повторные попытки

- Любой ответ `2xx` считается успешной отправкой.
- Ответы `408`, `425`, `429`, `5xx` или сетевые ошибки повторяются согласно политике очереди доставки.
- Остальные ответы `4xx` считаются окончательной ошибкой и не повторяются.
- Тайм-аут одного запроса — 15 секунд.

## Рекомендации по безопасности

- Используйте публичный HTTPS-адрес; не публикуйте адрес WebHook, ключ подписи или заголовок Authorization в открытых репозиториях.
- Получатель должен проверять подпись (если она настроена) и ограничивать повторные запросы.
- Ключ подписи и заголовок Authorization хранятся в системе в зашифрованном виде; ключ шифрования формируется на основе `APP_SECRET`. Пустое поле при редактировании означает сохранение прежнего значения.
- Если сервис развёрнут во внутренней сети и обращается к внешним интерфейсам через прокси, убедитесь, что исходящий трафик разрешён к целевому адресу.

## Связанные файлы

- Пример конфигурации и определения типов: `shared/schemas/index.ts`, `server/notify/types.ts`
- Реализация отправки WebHook: `server/notify/transports/webhook.ts`
- Формирование Payload события: `server/notify/render.ts`
