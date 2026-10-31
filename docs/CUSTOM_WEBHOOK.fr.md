# Canal WebHook personnalisé

[简体中文](CUSTOM_WEBHOOK.md) | [繁體中文](CUSTOM_WEBHOOK.zh-TW.md) | [English](CUSTOM_WEBHOOK.en.md) | [Deutsch](CUSTOM_WEBHOOK.de.md) | [Français](CUSTOM_WEBHOOK.fr.md) | [Italiano](CUSTOM_WEBHOOK.it.md) | [日本語](CUSTOM_WEBHOOK.ja.md) | [한국어](CUSTOM_WEBHOOK.ko.md) | [조선어](CUSTOM_WEBHOOK.ko-KP.md) | [Nederlands](CUSTOM_WEBHOOK.nl.md) | [Русский](CUSTOM_WEBHOOK.ru.md)

[Retour au README](../README.fr.md)

« Canaux de notification → WebHook personnalisé » permet d'envoyer les événements de surveillance au format JSON via POST vers n'importe quelle interface HTTPS ; ce canal convient à l'intégration de services auto-hébergés, de plateformes d'automatisation ou de passerelles de messagerie.

## Champs de configuration

| Champ | Obligatoire | Description |
| --- | --- | --- |
| Nom | Oui | Sert uniquement à l'identification dans le système |
| Adresse du WebHook | Oui | Adresse HTTPS recevant les notifications ; elle ne doit pas pointer vers la machine locale ou le réseau interne |
| Clé de signature HMAC | Non | Une fois définie, les requêtes portent un en-tête de signature, utilisé par le destinataire pour vérifier l'origine et l'intégrité |
| En-tête Authorization | Non | Envoyé tel quel dans l'en-tête `Authorization`, par exemple `Bearer <token>` |

> Les adresses HTTP ou de réseau interne ne sont autorisées que si `ALLOW_INSECURE_WEBHOOKS=1` est défini dans un environnement de test. En production, utilisez une adresse HTTPS publique.

## Format de la requête

Le système utilise `POST` avec un corps de requête JSON :

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: SteamGames-Monitor/1.0
X-SGM-Event: sale_start
X-SGM-Timestamp: 1793330000000
X-SGM-Signature: sha256=<hex hmac>
Authorization: Bearer <optional token>
```

Exemple de Payload d'événement :

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

Pour un message de test, `kind` vaut `"test"`, `eventId`, `eventType`, `severity` et `monitor` valent `null`, et `data` vaut `{}`.

- `eventType` correspond aux types d'événements du système, par exemple `release`, `sale_start`, `sale_change`, `sale_end`, `delisting_warning`, `delisted`.
- `data` conserve les champs supplémentaires d'origine de l'événement ; ces champs diffèrent selon le type d'événement.
- Les règles de filtrage des événements sont identiques à celles des autres canaux de notification ; si aucun événement n'est sélectionné, tous les événements sont reçus sauf `check_error`.

## Vérification de la signature HMAC

Si une clé de signature est configurée, le système envoie :

```text
X-SGM-Timestamp: <horodatage en millisecondes>
X-SGM-Signature: sha256=<hex>
```

Calcul de la signature :

```text
hex = HMAC-SHA256(secret, timestamp + "." + rawRequestBody)
```

Exemple de vérification en Node.js :

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

Calculez la signature directement à partir du **corps brut de la requête** reçu par la plateforme, sans désérialiser puis resérialiser. Il est recommandé de limiter également l'écart entre l'horodatage et l'heure actuelle (par exemple 5 minutes) pour éviter les rejeux.

## Réponse et nouvelles tentatives

- Toute réponse `2xx` est considérée comme un envoi réussi.
- Les réponses `408`, `425`, `429`, `5xx` ou les erreurs réseau déclenchent une nouvelle tentative selon la stratégie de la file de distribution.
- Les autres réponses `4xx` sont considérées comme des échecs définitifs et ne sont pas réessayées.
- Le délai d'expiration d'une requête est de 15 secondes.

## Recommandations de sécurité

- Utilisez une adresse HTTPS publique ; ne publiez pas l'adresse du WebHook, la clé de signature ou l'en-tête Authorization dans un dépôt public.
- Le destinataire doit vérifier la signature (si elle est configurée) et limiter les requêtes en double.
- La clé de signature et l'en-tête Authorization sont stockés chiffrés dans le système avec une clé dérivée de `APP_SECRET` ; laisser le champ vide lors de l'édition conserve la valeur existante.
- Si le service est déployé en réseau interne et accède à des interfaces externes via un proxy, assurez-vous que le réseau sortant autorise l'accès à l'adresse cible.

## Fichiers concernés

- Exemples de configuration et définitions de types : `shared/schemas/index.ts`, `server/notify/types.ts`
- Implémentation de l'envoi WebHook : `server/notify/transports/webhook.ts`
- Génération du Payload d'événement : `server/notify/render.ts`
