# Guide d'intégration Feishu / Lark, DingTalk et WeCom

[简体中文](BOT_INTEGRATION.md) | [繁體中文](BOT_INTEGRATION.zh-TW.md) | [English](BOT_INTEGRATION.en.md) | [Deutsch](BOT_INTEGRATION.de.md) | [Français](BOT_INTEGRATION.fr.md) | [Italiano](BOT_INTEGRATION.it.md) | [日本語](BOT_INTEGRATION.ja.md) | [한국어](BOT_INTEGRATION.ko.md) | [조선어](BOT_INTEGRATION.ko-KP.md) | [Nederlands](BOT_INTEGRATION.nl.md) | [Русский](BOT_INTEGRATION.ru.md)

[Retour au README](../README.fr.md)

Ce document explique comment intégrer Feishu / Lark, DingTalk et WeCom à Steam Games Monitor. Le projet propose deux capacités qui ne se remplacent pas l'une l'autre ; commencez donc par identifier votre objectif :

| Objectif                                                     | À créer côté plateforme                                                                              | Entrée du système       | Direction                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------- |
| Recevoir des rappels de sortie, de promotion, de délistage…  | Robot personnalisé de groupe / Webhook de robot de groupe                                             | **Canaux de notification** | Unidirectionnel : système → groupe |
| Envoyer des commandes `/add`, `/list`, etc. dans la conversation | Application auto-construite Feishu / Lark / robot interne DingTalk (Outgoing) / robot intelligent WeCom (connexion longue) | **Robots de commandes** | Bidirectionnel : plateforme → système → plateforme |

> Les Webhooks de robots de groupe ne peuvent généralement qu'envoyer des messages et non recevoir de commandes. Feishu / Lark et DingTalk permettent tous deux de créer une application en un clic par QR code et de choisir un callback HTTP ou une connexion longue ; WeCom nécessite la création d'un robot intelligent et l'utilisation d'une connexion longue.
>
> Les canaux de notification et les robots de commandes sont deux configurations indépendantes : pour une même plateforme, vous pouvez configurer uniquement les notifications, uniquement les commandes, ou les deux.

---

## 1. Préparation commune

### 1.1 HTTPS public et PUBLIC_BASE_URL (mode callback HTTP)

Feishu / Lark / DingTalk en mode **callback HTTP** nécessitent que la plateforme pousse activement les messages vers votre serveur ; les conditions suivantes doivent donc être remplies :

- Le service doit être accessible depuis l'Internet public, via une adresse **HTTPS** reconnue par la plateforme.
- La valeur `PUBLIC_BASE_URL` de `.env` doit correspondre à l'adresse réellement utilisée par le navigateur, par exemple `https://steam.example.com`.
- N'utilisez pas la valeur par défaut `http://localhost:8787`, sinon la plateforme ne pourra pas accéder à l'adresse de callback générée par le système.
- Il est recommandé d'utiliser un domaine ou un sous-domaine dédié. Les chemins de callback sont fixes et commencent par `/webhooks/...` ; ne déployez pas l'application sous un sous-chemin nécessitant une réécriture supplémentaire.

L'adresse de callback affichée dans le système est générée selon les règles suivantes :

```text
Feishu / Lark  https://<domaine de PUBLIC_BASE_URL>/webhooks/feishu/<slug>
DingTalk       https://<domaine de PUBLIC_BASE_URL>/webhooks/dingtalk/<slug>
```

Le `<slug>` est généré aléatoirement lors de la création du robot et diffère pour chaque robot. Après une modification de `PUBLIC_BASE_URL`, l'adresse de callback change et doit être mise à jour dans la console de la plateforme.

> Le **mode connexion longue** de Feishu / Lark, le **mode Stream** de DingTalk et le robot intelligent WeCom établissent tous une connexion sortante initiée par le serveur ; ils ne nécessitent ni adresse de callback publique, ni IP publique, ni Token, ni EncodingAESKey. Les applications Feishu / Lark et les robots DingTalk créés par QR code utilisent la connexion longue par défaut.
>
> Cependant, `PUBLIC_BASE_URL` doit rester accessible depuis le navigateur du propriétaire du robot : les liens d'autorisation Web envoyés aux utilisateurs non autorisés utilisent cette adresse.

### 1.2 Exigences pour le proxy inverse

Nginx, Caddy, Traefik ou un équilibreur de charge cloud doit respecter les points suivants (cela ne concerne que les callbacks HTTP de Feishu / Lark / DingTalk) :

- **Transmettre le corps de la requête tel quel**, sans resérialiser le JSON, sans compression ni modification du contenu ; les signatures Feishu / Lark et DingTalk reposent sur le corps brut de la requête.
- Conserver les en-têtes de la plateforme : `X-Lark-Request-Timestamp`, `X-Lark-Request-Nonce`, `X-Lark-Signature` pour Feishu, `timestamp`, `sign` pour DingTalk.
- Conserver les paramètres de requête, sans perdre les paramètres de signature.
- Ne pas ajouter d'authentification, de Basic Auth, de redirection HTML ou de validation interactive WAF sur `/webhooks/*`.
- Taille maximale du corps de requête d'au moins 1 Mo ; délai de lecture d'au moins 10 secondes.
- Utiliser un certificat TLS de confiance ; la plateforme vérifie la chaîne de certificats.

Les connexions longues Feishu / Lark, DingTalk Stream et WeCom ne passent pas par le proxy inverse ; le serveur doit simplement pouvoir accéder en sortie à la plateforme correspondante (Lark utilise `open.larksuite.com`, DingTalk Stream utilise `api.dingtalk.com`).

### 1.3 Synchronisation de l'heure et secrets

- Le serveur doit avoir la synchronisation NTP activée. Les signatures Feishu / Lark tolèrent un écart de ±300 secondes, les callbacks Outgoing DingTalk tolèrent un écart de ±1 heure.
- `APP_SECRET` (au moins 32 caractères) sert à chiffrer et stocker les identifiants des canaux et des robots. **Ne le changez pas et ne le perdez pas** : après un changement, les App Secret, secrets de robots, Encrypt Key, etc. déjà enregistrés ne pourront plus être déchiffrés et devront être saisis à nouveau.
- Les identifiants des robots sont stockés dans SQLite, chiffrés en AES-256-GCM ; l'API et les pages n'affichent jamais le texte en clair ; laisser un champ vide lors de l'édition conserve la valeur existante.

### 1.4 Ordre de création recommandé

Feishu / Lark (QR code, recommandé) :

1. Dans « Robots de commandes », cliquez sur « QR code Feishu / Lark », choisissez Feishu ou Lark international et scannez.
2. Créez et confirmez l'application sur la page de la plateforme ; le système enregistre automatiquement l'App ID / App Secret, l'`open_id` du propriétaire, et active la connexion longue.
3. Recherchez le nom de l'application dans Feishu / Lark pour démarrer une conversation privée, ou ajoutez le robot à un groupe.
4. Envoyez `/help` pour vérifier la chaîne de commande et de réponse.

Feishu / Lark (manuel) :

1. Créez un robot dans le système, choisissez la version (Feishu / Lark) et le mode de réception des événements (callback HTTP / connexion longue).
2. Callback HTTP : copiez l'adresse de callback dans la console de la plateforme et configurez l'Encrypt Key / Verification Token ; connexion longue : choisissez « Recevoir les événements via une connexion longue » sur la plateforme.
3. Abonnez-vous à `im.message.receive_v1` et demandez les permissions de lecture et d'envoi de messages.
4. Publiez l'application, ajoutez le robot à un groupe ou définissez la portée de disponibilité.
5. Envoyez `/help` pour vérifier.

DingTalk (QR code, recommandé) :

1. Dans « Robots de commandes », cliquez sur « Ajouter via QR code DingTalk », scannez avec l'application mobile DingTalk et confirmez la création.
2. Le système enregistre automatiquement le Client ID / Client Secret, utilise le Client ID comme Robot Code et active la connexion longue Stream.
3. Recherchez le robot dans DingTalk pour démarrer une conversation privée, ou ajoutez-le à un groupe.
4. Envoyez `/help` pour vérifier.

DingTalk (manuel) :

1. Créez un robot dans le système, choisissez le mode de réception des messages et copiez l'adresse de callback (mode HTTP).
2. Dans la console de la plateforme, créez l'application / le robot, renseignez l'adresse de callback et les secrets, ou sélectionnez le mode Stream dans la configuration du robot.
3. Lors de l'enregistrement du callback, la plateforme lance généralement une validation d'URL ; assurez-vous que le système est démarré et que le robot est activé.
4. Publiez l'application sur la plateforme, ajoutez le robot à un groupe ou définissez la portée de disponibilité.
5. Envoyez `/help` pour vérifier la chaîne de commande et de réponse.

WeCom :

1. Créez un robot intelligent dans la console d'administration WeCom, choisissez le mode API → connexion longue et récupérez le Bot ID et le Secret.
2. Dans le système, créez un « Robot intelligent WeCom (connexion longue) » et renseignez le Bot ID, le Secret et le UserID du propriétaire.
3. Après l'enregistrement, le système établit automatiquement la connexion longue, sans validation d'URL côté plateforme.
4. Ajoutez le robot à un groupe ou à une conversation privée et envoyez `/help` pour vérifier.

---

## 2. Canaux de notification (push unidirectionnel)

Les canaux de notification servent à pousser les événements de surveillance vers un groupe ; ils ne nécessitent pas d'adresse de callback publique, seulement l'URL de Webhook fournie par la plateforme.

### 2.1 Comparaison des trois types de robots de groupe

| Plateforme | Type dans le système            | Format des messages | Signature            | Description                                                         |
| ---------- | ------------------------------- | ------------------- | -------------------- | ------------------------------------------------------------------- |
| WeCom      | Robot de groupe WeCom           | markdown            | Aucune               | Environ 4096 octets par message, le système tronque ; le robot de groupe peut uniquement envoyer |
| Feishu     | Robot Feishu (robot personnalisé) | Carte interactive  | Clé de signature facultative | Validation de signature activable ; recommandée                     |
| DingTalk   | Robot DingTalk (robot personnalisé) | markdown         | Clé de signature facultative | Signature activable ; le système calcule la signature selon les règles DingTalk |

Point d'entrée : à gauche, **Canaux de notification → Nouveau canal**. Renseignez le nom, le Webhook, la clé de signature facultative et cochez les événements à recevoir.

> Les notifications d'événements sont envoyées par défaut via les Webhooks de robots de groupe configurés ici ; les « Robots de commandes » peuvent aussi activer séparément les notifications d'événements. Les deux sont indépendants et peuvent être utilisés simultanément.

### 2.2 Robot de groupe WeCom

1. Ouvrez le groupe WeCom → Paramètres du groupe → Robots de groupe → Ajouter un robot.
2. Copiez l'adresse du Webhook (généralement de la forme `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...`).
3. Dans « Canaux de notification » du système, choisissez **Robot de groupe WeCom**, collez le Webhook et enregistrez.
4. Cliquez sur « Envoyer un test » sur le canal pour vérifier que le message arrive dans le groupe.

Attention :

- Le Webhook est lui-même un identifiant : s'il est divulgué, n'importe qui peut envoyer des messages dans le groupe ; en cas de fuite, retirez le robot du groupe puis ajoutez-le à nouveau.
- Un robot de groupe ne peut pas recevoir de commandes telles que `/add` ; pour les commandes, utilisez le « Robot intelligent WeCom (connexion longue) ».
- La taille d'un message est limitée à environ 4096 octets ; le système tronque automatiquement et les longues listes peuvent être incomplètes.
- Les robots de groupe sont soumis à des limites de fréquence ; en cas de limitation, le système réessaie automatiquement.

### 2.3 Robot personnalisé Feishu

1. Ouvrez le groupe Feishu → Paramètres du groupe → Robots de groupe → Ajouter un robot → Robot personnalisé.
2. Copiez l'adresse du Webhook (généralement de la forme `https://open.feishu.cn/open-apis/bot/v2/hook/...`).
3. Il est recommandé de choisir **Validation de signature** dans les paramètres de sécurité, puis de copier la clé de signature.
4. Dans « Canaux de notification » du système, choisissez **Robot Feishu** et collez le Webhook ; si la signature est activée, renseignez la clé de signature.
5. Après l'enregistrement, envoyez un message de test.

Règles de signature (déjà implémentées dans le système, aucun calcul manuel nécessaire) :

- L'horodatage est exprimé en secondes.
- Utilisez `timestamp + "\n" + secret` comme clé HMAC-SHA256 pour signer une chaîne vide, puis encodez le résultat en Base64.
- L'horodatage et la signature sont envoyés avec le corps du message.

Si vous utilisez « Mot-clé personnalisé » ou « Liste blanche d'IP » au lieu de la signature, assurez-vous que le contenu de la notification contient le mot-clé, ou ajoutez l'IP de sortie du serveur à la liste blanche.

### 2.4 Robot personnalisé DingTalk

1. Ouvrez le groupe DingTalk → Paramètres du groupe → Assistant de groupe intelligent → Ajouter un robot → Personnalisé.
2. Copiez l'adresse du Webhook (généralement de la forme `https://oapi.dingtalk.com/robot/send?access_token=...`).
3. Il est recommandé de choisir **Signature** dans les paramètres de sécurité, puis de copier la clé de signature.
4. Dans « Canaux de notification » du système, choisissez **Robot DingTalk** et collez le Webhook ; si la signature est activée, renseignez la clé de signature.
5. Après l'enregistrement, envoyez un message de test.

Règles de signature (déjà implémentées dans le système) :

- L'horodatage est exprimé en millisecondes.
- Utilisez `secret` comme clé pour calculer le HMAC-SHA256 de `timestamp + "\n" + secret`, puis encodez le résultat en Base64.
- `timestamp` et `sign` sont envoyés comme paramètres de requête URL.

Si vous utilisez « Mot-clé personnalisé » ou « Plages d'adresses IP » au lieu de la signature, ajustez les paramètres de sécurité en conséquence. En cas de limitation de fréquence (par exemple le code d'erreur `90037`), le système réessaie automatiquement.

### 2.5 Abonnement aux événements et nouvelles tentatives

Un canal de notification permet de cocher les types d'événements auxquels s'abonner :

| Événement            | Description                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| `release`            | Sortie officielle d'un jeu / DLC                                       |
| `sale_start`         | La remise atteint le seuil de surveillance                             |
| `sale_change`        | Variation de la remise ou du prix pendant une promotion                |
| `sale_end`           | Fin de la remise, retour au prix initial                               |
| `price_change`       | Variation du prix initial hors promotion ou basculement de l'état gratuit |
| `delisting_warning`  | Une actualité Steam contient un mot-clé de délistage (heuristique, confirmation manuelle requise) |
| `delisted`           | Deux confirmations consécutives d'indisponibilité d'achat dans la boutique |
| `restored`           | Retour à l'état achetable                                              |
| `check_error`        | Échec de la vérification                                               |

- **Si aucun événement n'est coché**, tous les événements sont reçus par défaut, sauf `check_error`.
- En cas d'échec d'envoi, de nouvelles tentatives ont lieu après 30 secondes → 2 minutes → 10 minutes → 1 heure → 6 heures → 24 heures, soit 6 tentatives au maximum.
- Chaque carte de canal propose « Envoyer un test » pour vérifier le Webhook et la configuration de signature.

---

## 3. Robots de commandes (bidirectionnel)

Les robots de commandes permettent aux utilisateurs de gérer leurs éléments surveillés via des commandes à barre oblique dans les conversations Feishu / Lark, DingTalk ou WeCom. Feishu / Lark prend en charge le callback HTTP ou la connexion longue WebSocket, DingTalk le callback HTTP ou la connexion longue Stream, WeCom la connexion longue WebSocket ; les résultats sont renvoyés dans la conversation d'origine via l'API de la plateforme ou la connexion longue.

### 3.1 Comportement général

- **Portée** : les commandes agissent toujours sur les données du compte propriétaire du robot. Même si un autre administrateur de la liste d'autorisation utilise le robot, ce sont les éléments surveillés du propriétaire du robot qui sont modifiés.
- **Identifiant du propriétaire** : `ownerPlatformUserId` sert uniquement à identifier le scanneur / propriétaire du robot et n'accorde aucun droit de commande automatiquement.
- **Liste d'autorisation** : tous les utilisateurs de la plateforme (y compris l'ID du propriétaire) doivent figurer dans la liste d'autorisation pour exécuter des commandes, avec les rôles suivants :
  - `admin` : peut utiliser toutes les commandes.
  - `viewer` : peut uniquement utiliser `/help`, `/list`, `/price`, `/events`.
  - Les utilisateurs Feishu / Lark, DingTalk et WeCom absents de la liste d'autorisation reçoivent un lien d'autorisation Web à usage unique ; le robot n'exécute pas la commande d'origine. DingTalk prend également en charge ce lien.
- **Notifications d'événements** : le robot peut activer séparément « Recevoir les notifications d'événements » dans sa page d'édition, pour pousser les événements vers la session utilisée par le dernier utilisateur autorisé. Cette option est indépendante des « Canaux de notification » et peut être activée en même temps. Sans session récente, aucune notification n'est envoyée ; voir la section 3.5.
- **Format des messages** : seuls les messages texte sont traités actuellement. Les images, fichiers, textes enrichis et messages de carte sont ignorés.
- **Format des commandes** : commencent par `/` ou par la barre oblique pleine largeur `／` ; prise en charge de `/add@robot`, des arguments entre guillemets et de `--flag=value`.
- **Déduplication** : lorsque la plateforme livre plusieurs fois le même message, le système déduplique selon l'ID d'événement / de message de la plateforme et ne traite le message qu'une seule fois.
- **Limitation de fréquence** : au maximum 10 commandes par minute et par utilisateur de plateforme, 30 par minute et par conversation, 60 par minute et par robot ; en cas de limitation, un rappel est envoyé au maximum une fois par minute.
- **Réponse asynchrone** : les callbacks Feishu / Lark / DingTalk renvoient d'abord rapidement un succès ; les messages DingTalk Stream / WeCom sont reçus via la connexion longue ; les commandes sont exécutées en arrière-plan et le résultat est renvoyé via l'API de la plateforme ou la connexion longue. L'affichage de la réponse par la plateforme peut subir un léger délai.
- **Sélection parmi plusieurs résultats** : lorsque `/add` ou `/adddlc` renvoie plusieurs résultats pour une recherche par nom, le robot répond avec une liste numérotée ; répondez directement avec le numéro (valable 10 minutes) ou envoyez `/cancel` pour annuler.
- **Quotas** : chaque compte peut créer au maximum 3 robots ; une même plateforme ne peut avoir qu'un seul robot actif (Feishu et Lark international partagent le quota de la plateforme « Feishu »). Pour les robots à callback HTTP Feishu / Lark / DingTalk, l'adresse de callback devient immédiatement inopérante après désactivation (retour 404) ; les robots à connexion longue / Stream sont déconnectés après désactivation.

### 3.2 Robot d'application Feishu / Lark (recommandé)

> #### Pourquoi nous le recommandons
>
> Feishu/Lark propose une version personnelle, ce qui permet de bien séparer vie personnelle et vie professionnelle.



Feishu / Lark nécessite la création d'une **application auto-construite** avec la capacité de robot activée et l'abonnement aux événements de message. Les Webhooks de robots personnalisés de groupe ne peuvent pas recevoir de commandes. Feishu (version chinoise) utilise `open.feishu.cn` / `accounts.feishu.cn`, Lark international utilise `open.larksuite.com` / `accounts.larksuite.com` ; le système les distingue via la « version » configurée sur le robot.

#### Création en un clic par QR code (recommandé)

1. Dans « Robots de commandes », cliquez sur **QR code Feishu / Lark** et choisissez « Feishu » ou « Lark international » dans la boîte de dialogue.
2. Scannez avec le client correspondant ; la page préremplit le nom de l'application et n'autorise que la création d'une nouvelle application.
3. Après confirmation de la création, le système récupère automatiquement l'App ID / App Secret, enregistre l'`open_id` du scanneur comme propriétaire et active la connexion longue.
4. Le QR code est valable 10 minutes ; la demande est refusée si la plateforme dispose déjà d'un robot actif ou si le quota est atteint.
5. Recherchez le nom de l'application dans Feishu / Lark pour démarrer une conversation privée, ou ajoutez le robot à un groupe, puis envoyez `/help`.

> La création par QR code utilise le modèle officiel Feishu `PersonalAgent`, avec la capacité de robot, les permissions de message et l'événement `im.message.receive_v1` préconfigurés, le mode de réception étant la connexion longue. Si votre entreprise restreint la création par QR code, utilisez la configuration manuelle ci-dessous.
>
> Si le QR code Feishu est scanné par un locataire Lark, le système bascule automatiquement vers `accounts.larksuite.com` pour poursuivre l'autorisation.

#### Configuration manuelle

1. Ouvrez la [plateforme ouverte Feishu](https://open.feishu.cn/app) ou la [plateforme ouverte Lark](https://open.larksuite.com/app) et créez une application auto-construite.
2. Dans « Ajouter des capacités », activez le **Robot**.
3. Dans « Gestion des permissions », demandez les permissions liées aux messages :
   - `im:message.p2p_msg:readonly` : lire les messages privés envoyés au robot.
   - `im:message.group_at_msg:readonly` : recevoir les messages @mentionnant le robot dans les groupes.
   - `im:message:send_as_bot` : envoyer des messages au nom de l'application.
   - Si la console divise les permissions par scénario, demandez également les permissions correspondant à la lecture du contenu des messages et à l'envoi de messages.
4. Dans le système, créez un « Robot d'application Feishu / Lark » et choisissez la version et le mode de réception des événements :
   - **Connexion longue (recommandée)** : sur la plateforme, dans « Événements et callbacks », choisissez « Recevoir les événements via une connexion longue » et abonnez-vous à `im.message.receive_v1` ; aucune adresse de callback n'est nécessaire.
   - **Callback HTTP** : renseignez l'adresse `/webhooks/feishu/<slug>` affichée par le système comme adresse de requête ; si le chiffrement est requis, renseignez l'Encrypt Key et le Verification Token.
5. Créez une version et publiez l'application ; dans « Portée de disponibilité de l'application », assurez-vous que les utilisateurs concernés y ont accès.
6. Ajoutez le robot à un groupe, ou discutez directement avec lui.

#### Champs côté système

| Champ                              | Obligatoire                | Description                                                                 |
| ---------------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| Nom                                | Oui                        | Sert uniquement à l'identification dans le système                          |
| Version                            | Oui                        | Feishu (version chinoise) ou Lark (version internationale)                  |
| Mode de réception des événements   | Oui                        | Callback HTTP / connexion longue ; la création par QR code utilise la connexion longue par défaut |
| App ID                             | Recommandé                 | Nécessaire pour obtenir le `tenant_access_token`, répondre et pousser les événements |
| App Secret                         | Recommandé                 | Associé à l'App ID                                                          |
| Encrypt Key                        | Selon la plateforme en callback HTTP | Doit être strictement identique à celui de la console Feishu / Lark ; obligatoire si le chiffrement est activé |
| Verification Token                 | Recommandé en callback HTTP | Doit correspondre à la plateforme ; sert à vérifier l'origine des événements |
| ID utilisateur plateforme du propriétaire | Recommandé          | Renseignez l'`open_id` Feishu / Lark (généralement préfixé par `ou_`) ; rempli automatiquement en cas de création par QR code |
| API Base URL                       | Non                        | Réservé aux tests / à un proxy ; laissez vide en production                  |

#### Callback, connexion longue et signature

- **Callback HTTP** : lorsque la plateforme enregistre l'adresse d'abonnement aux événements, elle envoie un défi `url_verification` ; le système renvoie le `challenge`.
  - Si un Encrypt Key est configuré, le système vérifie la signature d'en-tête `SHA256(timestamp + nonce + encryptKey + rawBody)` avec une tolérance de ±300 secondes, puis déchiffre le contenu.
  - Si un Verification Token est configuré, le système vérifie le token de l'événement ; en cas de non-correspondance, il renvoie 401.
- **Connexion longue** : le serveur utilise l'App ID / App Secret pour se connecter activement au point de terminaison de connexion longue Feishu / Lark ; les événements sont poussés via la connexion authentifiée, sans vérification de signature, adresse publique ni proxy inverse. L'état de la connexion est affiché sur la carte du robot.
- Seuls les messages texte de `im.message.receive_v1` sont traités ; les messages envoyés par l'application elle-même sont ignorés.
- Les réponses utilisent en priorité l'interface « Répondre au message » ; en cas d'échec, le système retombe sur l'envoi d'un message au `chat_id`.
- Dans un groupe, vous devez **@mentionner le robot** avant de saisir une commande ; en conversation privée, l'envoi direct suffit.

#### ID du propriétaire et liste d'autorisation

- Dans les événements Feishu / Lark, l'identifiant utilisateur privilégié est l'`open_id` ; la liste d'autorisation doit donc contenir des `open_id`, et non des numéros de téléphone, des adresses e-mail ou des noms.
- La création par QR code enregistre l'`open_id` du scanneur dans « ID du propriétaire », mais celui-ci sert uniquement à l'identification et n'accorde aucun droit de commande automatiquement ; à la première utilisation, il faut encore approuver son propre compte de plateforme via l'autorisation Web.
- En configuration manuelle, vous pouvez consulter le débogage d'événements / les journaux de callback, ou demander à l'utilisateur d'envoyer un message puis consulter le détail de l'événement sur la plateforme.

### 3.3 Robot DingTalk (callback HTTP / Stream)

DingTalk nécessite la création d'un **robot interne à l'entreprise**, avec un mode de réception des messages au choix : **connexion longue Stream** (recommandé) ou **callback HTTP / Outgoing**. Les Webhooks de robots personnalisés de groupe DingTalk ne peuvent pas recevoir de commandes.

#### Ajout par QR code (recommandé)

1. Dans la page « Robots de commandes » du système, cliquez sur **Ajouter via QR code DingTalk**.
2. Scannez avec l'application mobile DingTalk, choisissez l'organisation, renseignez les informations du robot selon les instructions de la page et confirmez la création.
3. Le système récupère automatiquement le Client ID / Client Secret, utilise le Client ID comme Robot Code et active la connexion longue Stream ; le QR code est valable 10 minutes.
4. Après la création, recherchez le robot dans DingTalk pour démarrer une conversation privée, ou ajoutez-le à un groupe ; le `staffId` du scanneur sert uniquement à l'identification, les membres utilisateurs doivent toujours passer par l'autorisation Web ou être ajoutés à la liste d'autorisation.

> Si un robot actif existe déjà pour la plateforme, ou si le quota de robots est atteint, le scan est refusé ; traitez d'abord l'ancien robot sur la page.
>
> Le scan utilise la page officielle d'enregistrement d'application DingTalk. Si votre organisation restreint la création par QR code, ou si la page d'enregistrement renvoie une anomalie, vous pouvez toujours utiliser la configuration manuelle ci-dessous.

#### Configuration manuelle

1. Ouvrez la [plateforme ouverte DingTalk](https://open.dingtalk.com/) et créez une application interne à l'entreprise.
2. Dans « Ajouter des capacités », ajoutez un **Robot**.
3. Choisissez le mode de réception des messages :
   - **Mode Stream (recommandé)** : sélectionnez le mode Stream dans la configuration du robot et publiez ; aucune adresse de callback publique n'est nécessaire.
   - **Callback HTTP / Outgoing** : renseignez l'adresse `/webhooks/dingtalk/<slug>` affichée par le système, ainsi que l'App Secret pour la vérification de signature.
4. Dans le système, créez un « Robot DingTalk », renseignez le Client ID (App Key) et le Client Secret (App Secret) et choisissez le même mode de réception.
5. Pour pousser des notifications d'événements, renseignez le Robot Code (généralement identique au Client ID) et assurez-vous que l'application dispose de la permission d'envoi actif de messages par le robot.
6. Publiez l'application, ajoutez le robot à un groupe et envoyez `/help`.

#### Champs côté système

| Champ                             | Obligatoire                  | Description                                              |
| --------------------------------- | ---------------------------- | -------------------------------------------------------- |
| Nom                               | Oui                          | Sert uniquement à l'identification dans le système      |
| Mode de réception des messages    | Oui                          | Callback HTTP / connexion longue Stream ; la création par QR code utilise Stream par défaut |
| App Key (Client ID)               | Obligatoire en mode Stream   | Client ID de l'application DingTalk ; également requis pour les notifications d'événements |
| App Secret (Client Secret)        | Obligatoire en Stream / vérification HTTP | Identifiant d'établissement de la connexion Stream ; utilisé en callback HTTP pour vérifier la signature |
| Robot Code                        | Recommandé pour les notifications d'événements | Code du robot ; généralement identique au Client ID |
| ID utilisateur plateforme du propriétaire | Recommandé            | Renseignez le `staffId` DingTalk                          |
| API Base URL                      | Non                          | Réservé aux tests / à un proxy ; laissez vide en production |

#### Réception des messages et réponses

- **Mode Stream** : le serveur utilise le Client ID / Secret pour se connecter activement à la passerelle DingTalk Stream ; aucune IP publique, nom de domaine ou adresse de callback n'est nécessaire ; les messages du robot sont poussés via la connexion longue et le système envoie immédiatement un ACK avant d'exécuter la commande de façon asynchrone.
- **Callback HTTP** : les en-têtes de callback DingTalk contiennent `timestamp` (en millisecondes) et `sign` ; le système utilise l'App Secret comme clé pour calculer le HMAC-SHA256 de `timestamp + "\n" + App Secret`, avec une tolérance de ±1 heure.
- Les deux modes ne traitent que les messages texte avec `msgtype = text`.
- L'ID utilisateur est prioritairement `senderStaffId`, puis `senderId` ; l'ID du propriétaire et la liste d'autorisation doivent contenir des `staffId`.
- Les réponses sont envoyées en markdown via le `sessionWebhook` du corps du message, en @mentionnant l'auteur de la commande ; ce Webhook est généralement valable environ 1,5 heure ; après expiration, il suffit de renvoyer la commande.
- Le système déduplique selon le `msgId` DingTalk ; le mode Stream confirme en outre immédiatement le push pour éviter une livraison répétée par la plateforme.

#### ID du propriétaire et liste d'autorisation

- Basez-vous sur le `senderStaffId` de l'événement de callback (puis sur `senderId`) ; vous pouvez le consulter dans les journaux de débogage d'événements de la plateforme ouverte, ou le vérifier dans les détails du membre du carnet d'adresses.
- L'« ID du propriétaire » sert uniquement à l'identification et n'accorde aucun droit de commande automatiquement ; tous les utilisateurs DingTalk doivent passer par l'autorisation Web ou être ajoutés à la liste d'autorisation.
- La création par QR code ne renvoie pas toujours le `staffId` du scanneur ; vous pouvez le compléter manuellement. Lors de la première utilisation, il suffit que le compte propriétaire du robot se connecte à la page Web et approuve.

### 3.4 Robot intelligent WeCom (connexion longue)

WeCom nécessite la création d'un **robot intelligent** avec le mode **API → connexion longue**. Les Webhooks de robots de groupe WeCom peuvent uniquement envoyer et ne peuvent pas recevoir de commandes.

> Note de mise à niveau : l'ancien callback d'application auto-construite WeCom (Token / EncodingAESKey / CorpID / AgentID) n'est plus utilisé pour les robots de commandes. Les robots existants doivent être modifiés dans « Robots de commandes » pour renseigner le Bot ID / Secret du robot intelligent, puis enregistrés.

#### Ajout par QR code (recommandé)

1. Dans la page « Robots de commandes » du système, cliquez sur **Ajout via QR code WeCom**.
2. Scannez avec un WeCom disposant du droit de créer des robots intelligents, puis créez et autorisez le robot selon les instructions de la page.
3. Le système récupère automatiquement le Bot ID / Secret, crée le robot et établit la connexion longue ; le QR code est valable 5 minutes.
4. Après la création, demandez aux membres utilisateurs d'envoyer une commande ; l'approbation se fait par le compte propriétaire du robot connecté à la page Web ; le UserID du propriétaire sert uniquement à l'identification et n'accorde aucun droit automatiquement.

> Si un robot actif existe déjà pour la plateforme, ou si le quota de robots est atteint, le scan est refusé ; traitez d'abord l'ancien robot sur la page.
>
> Le scan utilise la page d'autorisation officielle WeCom. Si le compte n'a pas le droit de créer des robots intelligents, ou si WeCom a modifié le déroulement de la page, vous pouvez toujours utiliser la configuration manuelle ci-dessous.

#### Configuration manuelle

1. Ouvrez la [console d'administration WeCom](https://work.weixin.qq.com/) ou l'espace de travail du client WeCom, puis accédez à « Robot intelligent » → Créer un robot.
2. Dans le processus de création, choisissez « Créer en mode API » → « Utiliser une connexion longue ».
3. Récupérez et conservez le **Bot ID** et le **Secret**. Le Secret n'est généralement affiché qu'une seule fois ; s'il est perdu, il peut être régénéré.
4. Dans le système, créez un « Robot intelligent WeCom (connexion longue) » et renseignez le Bot ID, le Secret et le UserID du propriétaire.
5. Ajoutez le robot à un groupe ou à une conversation privée ; dans un groupe, **@mentionnez le robot** et envoyez `/help`.
6. Aucune adresse de callback, aucun Token, EncodingAESKey ni CorpID n'est nécessaire ; le service se connecte activement à `wss://openws.work.weixin.qq.com`.

#### Champs côté système

| Champ                                     | Obligatoire | Description                                                                        |
| ----------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| Nom                                       | Oui         | Sert uniquement à l'identification dans le système                                 |
| Bot ID                                    | Oui         | Identifiant unique du robot intelligent                                            |
| Secret                                    | Oui         | Secret dédié à la connexion longue, utilisé pour l'authentification `aibot_subscribe` |
| ID utilisateur plateforme du propriétaire | Recommandé  | UserID du membre dans le carnet d'adresses WeCom ; se référer au `from.userid` du callback réel du robot |

#### Mécanisme de connexion longue

- Le serveur se connecte activement à `wss://openws.work.weixin.qq.com`, ce qui convient aux déploiements en réseau interne et ne nécessite aucune IP publique fixe.
- Après l'établissement de la connexion, `aibot_subscribe` est envoyé pour l'authentification via Bot ID + Secret ; ensuite, un heartbeat `ping` est envoyé toutes les 30 secondes.
- Les messages utilisateur sont poussés en clair via `aibot_msg_callback`, sans déchiffrement ; le système ne traite que `msgtype = text`.
- Les réponses sont envoyées en markdown via `aibot_respond_msg` en reprenant le `req_id` du callback ; les réponses portant le même `req_id` sont envoyées en série.
- Un robot intelligent ne peut avoir qu'une seule connexion longue active à la fois ; une nouvelle connexion évince l'ancienne, et un déploiement multi-instances provoque des interruptions mutuelles.
- En cas de déconnexion, la reconnexion suit un backoff exponentiel ; en cas d'échecs d'authentification répétés ou de remplacement de la connexion par une nouvelle instance, la carte du robot affiche une anomalie de connexion longue.
- Pour les messages de groupe, le préfixe `@robot` est d'abord retiré, puis la commande à barre oblique est analysée.
- Une réponse est possible dans les 24 heures suivant le callback ; le système exécute les commandes dans une file en arrière-plan, et les commandes longues nécessitent généralement quelques secondes.
- Après activation des notifications d'événements du robot, le système utilise la même connexion longue avec `aibot_send_msg` pour pousser activement vers la session récente ; l'utilisateur doit d'abord avoir envoyé un message au robot.

#### ID du propriétaire et liste d'autorisation

- Renseignez le **UserID** du carnet d'adresses WeCom (compte de membre), et non un nom, un numéro de téléphone ou un ID de contact externe.
- Si le créateur du robot n'est pas super-administrateur de l'entreprise, `from.userid` peut être un userid chiffré sous l'entité de l'entreprise ; configurez le propriétaire et la liste d'autorisation en vous basant sur les valeurs de l'événement de callback réel.

#### Non autorisation et autorisation Web

- Lorsqu'un utilisateur WeCom n'est pas dans la liste d'autorisation, le robot répond avec un lien d'autorisation Web à usage unique (`PUBLIC_BASE_URL/authorize/<token>`), valable 30 minutes.
- Le propriétaire du robot se connecte à la page du lien avec son propre compte Web, vérifie l'ID utilisateur de la plateforme (ainsi que le pseudo et la conversation disponibles), choisit `viewer` ou `admin`, puis approuve ou refuse.
- Un utilisateur qui n'est pas propriétaire du robot ne peut qu'afficher la demande après connexion et ne peut pas l'approuver lui-même ; il doit transmettre le lien au propriétaire du robot.
- Le lien d'autorisation devient inopérant après un premier traitement ; les autres liens en attente du même utilisateur sont mis à jour en conséquence. Après expiration, demandez à l'utilisateur de renvoyer n'importe quelle commande pour générer un nouveau lien.
- Tous les membres utilisateurs (y compris le scanneur lui-même) doivent obtenir leurs droits via l'autorisation Web ou la liste d'autorisation ; si vous souhaitez disposer de toutes les commandes, choisissez `admin` lors de l'approbation.
- `PUBLIC_BASE_URL` doit être accessible depuis le navigateur ; si le lien ne s'ouvre pas, vérifiez le proxy inverse et cette variable d'environnement.

#### État de la connexion

La carte du robot affiche l'état de la connexion longue :

- **Connexion longue en cours** : connexion ou reconnexion automatique en cours.
- **Connexion longue établie** : authentification réussie, les commandes peuvent être reçues.
- **Anomalie de connexion longue** : identifiants erronés, Bot ID / Secret non renseigné, réseau inaccessible, échec d'authentification ou connexion remplacée par une autre instance.
- **Connexion longue désactivée** : le robot est désactivé.

Si l'état reste anormal, vérifiez le Bot ID / Secret, si le pare-feu sortant du serveur autorise `wss://openws.work.weixin.qq.com:443`, et si une autre instance utilise le même Bot ID.

### 3.5 Notifications d'événements des robots

Après avoir coché **Recevoir les notifications d'événements** dans la page d'édition du « Robot de commandes », le robot reçoit en plus les événements de sortie, de promotion, de délistage, etc. Il s'agit d'une configuration indépendante des canaux de notification ; les deux peuvent être activées simultanément.

- **Cible des notifications** : la session utilisée le plus récemment par un membre de la liste d'autorisation du robot. Le système ne met à jour cette cible qu'après l'envoi réussi d'une commande par un utilisateur autorisé ; les utilisateurs non autorisés ne modifient pas la cible de notification.
- **Condition préalable** : le robot cible doit avoir reçu au moins une commande d'un utilisateur autorisé, sinon aucun événement n'est distribué. La carte du robot indique « aucune session récente enregistrée ».
- **Portée des événements** : tous les événements sont reçus, y compris les erreurs de vérification ; le filtrage par type d'événement n'est pas pris en charge pour chaque robot.
- **Les robots de groupe des canaux de notification continuent d'envoyer selon les règles d'abonnement propres au canal ; les deux sont indépendants.**

Exigences supplémentaires par plateforme :

- **Feishu / Lark** : App ID / App Secret requis, ainsi que la permission d'envoyer des messages dans une conversation au nom de l'application. Les événements sont envoyés au `chat_id` de la session récente ; les modes callback HTTP et connexion longue conviennent tous les deux.
- **DingTalk** : App Key, App Secret et Robot Code requis, ainsi que la permission d'envoi actif de messages par le robot. Les groupes utilisent `openConversationId`, les conversations privées utilisent le `staffId` de l'expéditeur.
- **WeCom** : utilisation de `aibot_send_msg` via la connexion longue pour pousser vers la session récente ; `chat_type=1` en conversation privée, `chat_type=2` en groupe. L'utilisateur doit avoir eu au préalable une conversation avec le robot.

> Si le robot est désactivé, si l'option de notifications d'événements est désactivée, si la session récente est supprimée ou si le robot est retiré du groupe, la distribution est annulée ou échoue ; il suffit qu'un utilisateur autorisé renvoie une commande pour actualiser la session cible.

---

## 4. Mémo des commandes

```text
/help
/add <appid | lien boutique | nom> [--discount N] [--note texte] [--force]
/adddlc <appid du jeu de base | lien | nom> [--max 50]
/remove <id | appid | nom>
/pause <id | appid | nom>
/resume <id | appid | nom>
/check <id | appid | nom>
/price <id | appid | nom>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

Remarques :

- `/add` permet de rechercher directement dans la boutique Steam ; lorsque la recherche par nom renvoie plusieurs résultats, répondez avec le numéro pour choisir.
- `--discount N` définit le seuil de notification de remise (0–100) ; si le paramètre est omis, la valeur par défaut du compte est utilisée.
- `--force` sert aux cas où la région actuelle ne permet pas la récupération, mais où vous souhaitez tout de même ajouter l'élément pour ne faire que de l'alerte par actualités.
- `/adddlc` importe tous les DLC du jeu de base, dans la limite de 50 par appel.
- `/check` contourne le cache, vérifie immédiatement et écrit les événements ; il est soumis aux limites de débit Steam.
- `/list` n'affiche pas les éléments en pause par défaut ; `--all` affiche tout, `--sale` affiche uniquement les promotions en cours, `--paused` uniquement les éléments en pause.
- `/events` affiche par défaut les 10 derniers événements, 20 au maximum.
- Les droits de consultation sont limités à `/help`, `/list`, `/price`, `/events`.

---

## 5. Dépannage des problèmes courants

| Symptôme                                                     | Cause possible                                                                                                       | Traitement                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Échec de l'enregistrement de l'adresse de callback Feishu / Lark / DingTalk | Service non accessible publiquement, certificat invalide, `PUBLIC_BASE_URL` erroné                                   | Accédez au domaine de callback via les données mobiles ; vérifiez que la chaîne de certificats HTTPS est complète ; vérifiez que le robot est créé et activé |
| Le callback Feishu / Lark / DingTalk renvoie 404             | Robot désactivé ou supprimé, ou `<slug>` erroné                                                                       | Copiez la dernière adresse de callback depuis la page « Robots de commandes » ; activez le robot |
| Feishu / Lark signale un échec de défi / 401                 | Verification Token ou Encrypt Key différent ; le proxy a réécrit le corps de la requête                              | Vérifiez à nouveau des deux côtés ; désactivez la compression / réécriture du corps ; conservez les en-têtes `X-Lark-*` |
| Aucune réaction du robot Feishu / Lark après activation du chiffrement | L'Encrypt Key est activé côté plateforme mais non renseigné dans le système, le contenu chiffré ne peut pas être analysé ; la validation du Verification Token peut aussi entraîner un 401 | Renseignez dans le système le même Encrypt Key et le même Verification Token, ou désactivez le chiffrement côté plateforme puis enregistrez à nouveau |
| Feishu / Lark reçoit les messages mais ne peut pas répondre | App ID / App Secret non renseigné, ou permission d'envoi de messages manquante                                          | Complétez les identifiants ; demandez et publiez la permission d'envoi de messages sur la plateforme ouverte |
| La connexion longue Feishu / Lark reste « connexion en cours » / en anomalie | App ID / App Secret erroné ; l'application n'a pas activé « Recevoir les événements via une connexion longue » ; l'entreprise restreint la création par QR code | Vérifiez les identifiants ; basculez sur la connexion longue dans « Événements et callbacks » et publiez une version ; ou revenez au callback HTTP |
| Le robot Feishu / Lark est introuvable après le scan             | Application non publiée ou portée de disponibilité excluant ce membre                                                | Créez une version et publiez-la sur la plateforme ouverte, ajustez la portée ; recherchez par nom d'application |
| Le QR code Feishu a créé une application Lark                   | Le compte scanneur appartient à un locataire Lark, le système a automatiquement changé le domaine d'autorisation      | Comportement normal ; recherchez le nom de l'application dans Lark                             |
| Callback DingTalk 401                                          | App Secret erroné ; en-têtes supprimés par le proxy ; décalage d'heure du serveur supérieur à 1 heure                 | Vérifiez l'App Secret de l'application (et non la clé de signature) ; conservez `timestamp`, `sign` ; synchronisez NTP |
| Réponse DingTalk en timeout / échec                            | `sessionWebhook` expiré                                                                                                | Renvoyez la commande ; assurez-vous que le callback est traité en quelques secondes           |
| Le Stream DingTalk reste non connecté / en anomalie            | Client ID / Secret erroné ; le robot n'a pas choisi le mode Stream ; application non publiée ; le serveur ne peut pas accéder en sortie à `api.dingtalk.com` | Vérifiez les identifiants ; choisissez Stream dans la configuration du robot et publiez une version ; vérifiez le réseau sortant |
| Le scan DingTalk indique un échec d'autorisation               | Le compte scanneur n'a pas de droits de développeur ; QR code expiré ; l'entreprise sélectionnée interdit la création d'applications ; échec du chargement du modèle de page d'autorisation | Vérifiez que le compte possède des droits de développeur dans l'entreprise cible ; régénérez le QR code ; changez d'entreprise ; en cas d'échec persistant, consultez le motif « DingTalk scan authorization failed » dans les journaux du service |
| Aucune réponse du robot DingTalk après le scan                 | Application non publiée ou portée excluant ce membre ; robot non ajouté à la conversation ; connexion Stream non établie | Publiez l'application et ajustez la portée ; consultez l'état de la connexion sur la carte du robot ; renvoyez la commande |
| L'utilisateur DingTalk / Feishu est signalé comme non autorisé | Cet utilisateur de la plateforme n'est pas dans la liste d'autorisation et n'est pas encore passé par l'autorisation Web | Demandez à l'utilisateur d'envoyer n'importe quelle commande pour obtenir un lien d'autorisation, puis approuvez-le depuis le compte propriétaire du robot connecté à la page Web, ou ajoutez-le directement à la liste d'autorisation |
| La connexion longue WeCom n'est pas connectée / est en anomalie | Bot ID ou Secret erroné ; le serveur ne peut pas accéder en sortie à `openws.work.weixin.qq.com:443` ; une autre instance utilise le même robot ; robot désactivé | Vérifiez le Bot ID / Secret ; contrôlez le pare-feu sortant et le proxy ; assurez-vous qu'il n'y a pas de déploiement en double ; consultez l'état et les messages d'erreur sur la carte du robot |
| Aucune réponse aux messages WeCom                              | Connexion longue interrompue ; message au-delà de la fenêtre de réponse de 24 heures ; robot désactivé ou supprimé pendant le traitement | Vérifiez l'état de la connexion longue ; renvoyez la commande ; assurez-vous que le robot reste activé |
| WeCom indique que la connexion a été remplacée                 | Une nouvelle connexion a été établie avec le même Bot ID, l'ancienne a été évincée par WeCom                         | Ne conservez qu'une seule instance en fonctionnement par robot ; arrêtez le service déployé en double, ou désactivez puis réactivez le robot dans le système |
| Aucune réponse aux commandes                                   | Robot non @mentionné dans le groupe ; message non texte ; ne commence pas par `/` ; utilisateur absent de la liste d'autorisation | @mentionnez le robot dans le groupe ; envoyez `/help` ; ajoutez l'ID utilisateur de la plateforme à la liste d'autorisation |
| Le scanneur lui-même n'a pas de droit de commande              | L'ID du propriétaire sert uniquement à l'identification et n'accorde plus implicitement de droits                              | Approuvez votre propre compte de plateforme sur la page d'autorisation Web, ou demandez au compte propriétaire du robot d'ajouter votre ID de plateforme à la liste d'autorisation |
| Conflit à la création du robot                                 | Un robot actif existe déjà pour la même plateforme                                                                   | Désactivez d'abord l'ancien robot, puis activez le nouveau                                   |
| Échec du test d'un canal de notification                       | Webhook invalide, clé de signature erronée, restrictions de mot-clé / liste blanche d'IP                              | Copiez à nouveau le Webhook ; vérifiez la clé de signature ; contrôlez les paramètres de sécurité de la plateforme |
| Aucune notification d'événement dans le groupe                 | Canal désactivé, types d'événements non cochés, robot de groupe retiré                                               | Vérifiez l'état du canal et l'abonnement aux événements ; renvoyez un message de test          |
| Le robot ne pousse pas de notifications d'événements           | « Recevoir les notifications d'événements » non activé ; aucune session autorisée récente ; App Key / Robot Code DingTalk manquant ; robot désactivé | Activez les notifications dans l'édition du robot ; demandez à un utilisateur autorisé d'envoyer d'abord une commande ; complétez les identifiants DingTalk ; consultez les enregistrements de distribution |
| Feishu / Lark / DingTalk pousse plusieurs fois le même message | La plateforme n'a pas reçu l'ACK à temps ou instabilité réseau                                                       | Le système déduplique par ID de message ; assurez-vous que le callback répond en moins de 10 secondes |

### Conseils de débogage

1. Utilisez d'abord la **commande simulée** de la carte « Robots de commandes » pour l'exécuter localement en tant que propriétaire du robot et vérifier que la logique des commandes et les quotas fonctionnent correctement.
2. Utilisez ensuite **Envoyer un test** dans « Canaux de notification » pour vérifier le Webhook et la signature.
3. Enfin, envoyez `/help` dans la conversation de la plateforme pour vérifier le callback / la connexion longue, les permissions et la chaîne de réponse.
4. Consultez les journaux du conteneur : `docker compose logs -f steam-monitor`, en prêtant attention aux journaux `wecom`, `webhook`, `inbound`, `delivery`.

---

## 6. Recommandations de sécurité

- Les adresses de callback Feishu / Lark / DingTalk, les Webhooks de robots de groupe et le Bot ID / Secret WeCom sont tous considérés comme des identifiants ; ne les validez pas dans un dépôt public et ne les publiez pas dans un groupe public.
- Pour les callbacks HTTP Feishu / Lark, il est recommandé d'activer Encrypt Key + Verification Token ; les identifiants de connexion longue doivent également rester confidentiels. Les callbacks HTTP DingTalk doivent renseigner l'App Secret pour la vérification de signature, et le mode Stream doit également protéger le Client Secret ; WeCom doit protéger le Bot ID et le Secret de connexion longue.
- La liste d'autorisation doit suivre le principe du moindre privilège : les membres ordinaires utilisent `viewer`, seuls les administrateurs utilisent `admin`.
- N'exposez pas le fichier SQLite sur l'Internet public ; sauvegardez régulièrement la base de données et sauvegardez en même temps l'`APP_SECRET` de `.env`.
- Après une modification de `PUBLIC_BASE_URL` ou un changement de domaine, mettez à jour rapidement les adresses de callback dans les consoles Feishu / Lark / DingTalk ; le mode connexion longue n'est pas concerné.
- En cas de suspicion de fuite d'identifiants : réinitialisez l'App Secret / Encrypt Key dans Feishu / Lark, le Client Secret dans DingTalk, régénérez le Secret du robot intelligent dans WeCom, puis saisissez-les à nouveau dans le système.

---

## 7. Documentation officielle

- Abonnement aux événements et configuration de l'adresse de requête Feishu : <https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case>
- Création d'application Feishu en un clic : <https://open.feishu.cn/document/mcp_open_tools/scan-to-create-an-app-in-one-click>
- Robot personnalisé Feishu : <https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot>
- Abonnement aux événements et configuration de l'adresse de requête Lark : <https://open.larksuite.com/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case>
- Création d'application Lark en un clic : <https://open.larksuite.com/document/mcp_open_tools/scan-to-create-an-app-in-one-click>
- Réception de messages par le robot DingTalk : <https://open.dingtalk.com/document/orgapp/receive-message>
- Mode Stream DingTalk : <https://open.dingtalk.com/document/development/stream>
- Création d'application d'agent intelligent DingTalk en un clic : <https://open.dingtalk.com/document/development/create-dingtalk-intelligent-agent-application>
- Robot personnalisé DingTalk : <https://open.dingtalk.com/document/orgapp/custom-robot-access>
- Connexion longue du robot intelligent WeCom : <https://developer.work.weixin.qq.com/document/path/101463>
- Réponse de messages par le robot intelligent WeCom : <https://developer.work.weixin.qq.com/document/path/101836>
- Robot de groupe WeCom : <https://developer.work.weixin.qq.com/document/path/91770>

Points d'entrée des consoles de plateforme :

- Plateforme ouverte Feishu : <https://open.feishu.cn/app>
- Plateforme ouverte Lark : <https://open.larksuite.com/app>
- Plateforme ouverte DingTalk : <https://open.dingtalk.com/>
- Console d'administration WeCom : <https://work.weixin.qq.com/>

> Les menus et les noms de permissions des consoles de plateforme peuvent évoluer selon les versions ; référez-vous à la documentation officielle et à la console réelle.
