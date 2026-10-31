# SteamGames-Monitor

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [조선어](README.ko-KP.md) | [Nederlands](README.nl.md) | [Русский](README.ru.md)

L’interface est disponible en chinois simplifié, chinois traditionnel, anglais, allemand, français, italien, japonais, coréen, nord-coréen, néerlandais et russe. Changez de langue via le sélecteur en haut à droite ; ce réglage est indépendant de la langue du contenu Steam.

Système auto-hébergé et multi-utilisateurs de surveillance du statut de vente des jeux / DLC Steam. Les données sont stockées dans SQLite ; le système surveille les **retraits de vente / délistages à venir, les promotions et les sorties**, et notifie via un robot de groupe WeCom, un robot Feishu, un robot DingTalk ou des e-mails SMTP.
Un même processus fournit à la fois l'interface Web, l'API REST, l'ordonnancement du polling Steam, la file de distribution des notifications, les callbacks Feishu / Lark / DingTalk, ainsi que les connexions longues Feishu, DingTalk Stream et WeCom ; il est adapté à un déploiement Docker Compose sur une seule machine.

## Fonctionnalités

- **Comptes multi-utilisateurs indépendants** : l'administrateur crée les comptes ; chaque utilisateur dispose de ses propres éléments surveillés, événements, canaux de notification et robots de commandes, avec une isolation stricte des données.
- **Éléments surveillés** : prise en charge de l'appid, du lien vers la boutique et de la recherche par nom ; import groupé de tous les DLC d'un jeu de base.
- **Changements d'état** : sortie (basculement de « coming soon »), début / variation / fin de promotion, changement du prix de base, indisponibilité (délistage) et restauration.
- **Détermination du délistage** : le délistage n'est confirmé qu'après deux basculements consécutifs de l'état d'achat dans la boutique ; combiné à des mots-clés des actualités Steam pour une alerte anticipée (heuristique, à titre indicatif uniquement).
- **Canaux de notification** : robot de groupe WeCom, robot personnalisé Feishu, robot personnalisé DingTalk, WebHook personnalisé, e-mail SMTP ; nouvelle tentative automatique en cas d'échec.
- **Robots de commandes** : robot d'application Feishu / Lark (création en un clic par QR code, callback HTTP ou connexion longue WebSocket), robot DingTalk (création en un clic par QR code, callback HTTP ou connexion longue Stream), connexion longue du robot intelligent WeCom ; prise en charge de la création par QR code, de l'autorisation via une page Web et des notifications d'événements ; commandes `/add`, `/list`, `/price`, `/check`, `/pause`, `/resume`, `/remove`, `/adddlc`, `/events`, `/cancel` ; WeChat ClawBot et QQ Bot sont en cours d'intégration selon les protocoles officiels des plateformes.
- **Exploitation facilitée** : contrôle de santé, image Docker, sauvegarde de la base en ligne, politique de rétention des données configurable.

## Pile technique

- Node.js 24 + TypeScript (ESM), Hono, `node:sqlite` (WAL), Zod, Nodemailer
- Vue 3 + Vite + Pinia + Vue Router (les artefacts de build sont servis directement par le processus Node)
- Tests : Vitest (unitaires), Playwright (bout en bout)

## Démarrage rapide (développement local)

Prérequis : Node.js `^22.18 || >=24.12` et pnpm.

```bash
pnpm install
cp .env.example .env
# Modifiez .env : renseignez au minimum APP_SECRET (>=32 caractères)
openssl rand -base64 48
pnpm dev
```

- Interface Web : http://localhost:5173
- API backend : http://localhost:8787

Au premier démarrage, ouvrez directement l'interface Web pour créer le premier compte administrateur et choisissez la région, la langue et le fuseau horaire. **La région n'a pas de valeur par défaut** ; un compte dont l'initialisation n'est pas terminée ne peut pas ajouter d'éléments surveillés. L'endpoint d'initialisation devient automatiquement inopérant après la création du premier administrateur ; comme aucun jeton d'initialisation n'est plus nécessaire, n'exposez pas une instance non initialisée sur l'Internet public et terminez l'initialisation immédiatement après le déploiement.

### Build de production

```bash
pnpm build   # vérification des types + build du frontend dist/ + serveur dist-server/index.js
pnpm start   # build préalable nécessaire ; Node sert à la fois l'API et le frontend statique
```

## Variables d'environnement

| Variable | Description |
| --- | --- |
| `NODE_ENV` | En `production`, impose la validation de `APP_SECRET` |
| `HOST` / `PORT` | Adresse et port d'écoute, par défaut `0.0.0.0:8787` |
| `DATA_DIR` | Répertoire de données, par défaut `./data` (dans Docker : `/data`) |
| `DATABASE_PATH` | Chemin du fichier SQLite, par défaut `${DATA_DIR}/steam-monitor.db` |
| `APP_SECRET` | Obligatoire, ≥32 caractères. Sert à dériver les clés de chiffrement des identifiants des canaux / robots ; **en cas de perte, les clés déjà enregistrées ne peuvent plus être déchiffrées** |
| `PUBLIC_BASE_URL` | Adresse d'accès externe, utilisée pour générer les URL de callback Feishu / Lark / DingTalk, les liens d'autorisation Web WeCom et la validation CSRF ; les connexions longues elles-mêmes ne nécessitent pas de callback public |
| `TRUSTED_ORIGINS` | Origines supplémentaires autorisées, séparées par des virgules (en développement, incluez `http://localhost:5173`) |
| `COOKIE_SECURE` | À définir sur `1` lors d'un déploiement HTTPS |
| `TRUST_PROXY` | Nombre de couches de proxy inverse |
| `MAX_TOTAL_MONITORS` | Nombre maximal global d'éléments surveillés, par défaut 2000 |
| `ALLOW_INSECURE_WEBHOOKS` | À définir sur `1` uniquement pour les tests, autorise les Webhooks http / réseau interne |
| `ENABLE_DEV_COMMANDS` / `DEV_COMMAND_TOKEN` | Simulation de commandes via `/api/dev/command` à des fins de développement |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` ; les journaux fichiers sont écrits dans `${DATA_DIR}/logs/app-YYYY-MM-DD.log` |
| `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL` | Facultatif, remplace les endpoints Steam (pour les tests / un proxy) |

En environnement proxy, vous pouvez utiliser `HTTPS_PROXY`, `NODE_USE_ENV_PROXY=1` et `NO_PROXY`. Si la chaîne de certificats du système n'est pas reconnue par Node, le service fusionne les CA système au démarrage (`lib/tls.ts`).

## Déploiement Docker Compose

GitHub Actions publie une image instantané (`dev`) lors d'un push sur la branche `main`, et publie une version sémantique lors du push d'un tag de version stable (par exemple `v1.1.0`) en pointant `latest` vers cette version stable :

```bash
# Dernière version stable
docker pull akarinliu2000/steamgames-monitor:latest
# Version stable actuelle 1.1.0
docker pull akarinliu2000/steamgames-monitor:1.1.0
# Dernier instantané de la branche main
docker pull akarinliu2000/steamgames-monitor:dev
```

Les images prennent en charge `linux/amd64` et `linux/arm64` ; Docker sélectionne automatiquement l'architecture de l'hôte. Deux images de base sont disponibles :

| Tag | Image de base | Description |
| --- | --- | --- |
| `latest` / `1.1.0` / `1.1` | Debian slim (`node:24-bookworm-slim`) | Dernière version stable |
| `latest-alpine` / `1.1.0-alpine` / `1.1-alpine` | Alpine (`node:24-alpine`) | Dernière version stable Alpine |
| `dev` | Debian slim | Dernier instantané de la branche `main` |
| `dev-alpine` | Alpine | Dernier instantané Alpine de la branche `main` |

`latest` n'est déplacé que sur les tags non préliminaires (comme `v1.1.0`) ; les tags contenant `-rc` / `-beta` n'écrasent pas `latest`. Les commits ordinaires de la branche `main` ne mettent à jour que `dev` / `dev-alpine` et les tags `sha-*`.

```bash
docker pull akarinliu2000/steamgames-monitor:latest-alpine
# Build local de la version Alpine
docker build --build-arg BASE_IMAGE=node:24-alpine -t steam-monitor:alpine .
```

Exécution directe à partir de l'image :

```bash
cp .env.example .env
# Renseignez APP_SECRET, PUBLIC_BASE_URL (adresse HTTPS publique), COOKIE_SECURE=1, TRUST_PROXY=1
docker run -d --name steam-monitor \
  --env-file .env \
  -p 8787:8787 \
  -v "$(pwd)/data:/data" \
  --restart unless-stopped \
  akarinliu2000/steamgames-monitor:latest
```

Afficher les journaux du conteneur :

```bash
# Méthode docker run
docker logs -f steam-monitor

# Méthode docker compose
docker compose logs -f steam-monitor
```

Si `docker ps` affiche un nom de conteneur aléatoire (par exemple `nervous_roentgen`), c'est que `--name steam-monitor` n'a pas été ajouté au démarrage ; dans ce cas, `docker compose logs` n'affichera pas ce conteneur et il faut utiliser `docker logs -f <nom réel du conteneur>`. Avec un `docker run` isolé, les paramètres tels que `LOG_LEVEL` et `PUBLIC_BASE_URL` ne sont chargés que si `--env-file .env` est passé ; sinon, le niveau de journalisation vaut `info` par défaut et `PUBLIC_BASE_URL` vaut `http://localhost:8787` par défaut.

Les journaux de l'application sont également écrits par date UTC dans `${DATA_DIR}/logs/app-YYYY-MM-DD.log` ; Docker les mappe par défaut vers `./data/logs/` sur l'hôte. La sortie standard du conteneur est conservée et reste consultable avec `docker logs`. Les fichiers de journal ne sont pas supprimés automatiquement ; archivez-les ou nettoyez-les selon vos besoins.

Démarrer Compose avec l'image Docker Hub :

```bash
docker compose pull
docker compose up -d
```

Reconstruire localement après modification du code (écrase l'image locale avec le tag du même nom sur Docker Hub) :

```bash
docker compose up -d --build
```

### Publication sur Docker Hub

Adresse Docker Hub : <https://hub.docker.com/r/akarinliu2000/steamgames-monitor> (`akarinliu2000/steamgames-monitor`)

`.github/workflows/dockerhub.yml` publie un instantané `dev` lors d'un push sur la branche `main`, et publie une version sémantique et met à jour `latest` lors du push d'un tag de version stable :

- Les Secrets du dépôt doivent contenir `DOCKERHUB_USERNAME` et `DOCKERHUB_TOKEN` (token d'accès Docker Hub, avec les droits Read & Write).
- Images actuelles : `docker.io/akarinliu2000/steamgames-monitor:latest`, `:1.1.0`, `:dev` (Debian), ainsi que les variantes `-alpine` correspondantes, toutes multi-architectures amd64/arm64.
- Le dépôt Docker Hub est public ; vous pouvez donc le récupérer anonymement.
- Pour utiliser un espace de noms d'organisation, ajoutez la variable de dépôt `DOCKERHUB_REPOSITORY` (par exemple `myorg/steamgames-monitor`).

```bash
docker pull akarinliu2000/steamgames-monitor:latest
```

```bash
gh secret set DOCKERHUB_USERNAME --repo AkarinLiu/SteamGames-Monitor
gh secret set DOCKERHUB_TOKEN --repo AkarinLiu/SteamGames-Monitor
```

- Les données sont persistées dans `./data` sur l'hôte (monté sur `/data` dans le conteneur) ; la base de données, les sauvegardes et les journaux `logs/` y sont écrits.
- L'entrée de l'image corrige les permissions de `./data`, puis abaisse les privilèges pour exécuter l'application sous l'utilisateur `node` du conteneur ; sous Linux, vous pouvez aussi exécuter manuellement `sudo chown -R 1000:1000 data`.
- Le script d'entrée mappe automatiquement les `DATA_DIR` / `DATABASE_PATH` relatifs de `.env` vers `/data`, de sorte qu'un `docker run --env-file .env` isolé accède également normalement à l'assistant d'initialisation.
- Dans le conteneur, `/data` est toujours utilisé comme répertoire de données ; Compose écrase les `DATA_DIR` / `DATABASE_PATH` de `.env`, ne les remplacez pas par un chemin relatif dans le conteneur.
- `PUBLIC_BASE_URL` doit correspondre à l'adresse réellement utilisée par le navigateur (par exemple `http://192.168.1.10:8787`) ; modifiez-la également en cas d'utilisation d'un nom de domaine / d'un reverse proxy HTTPS.
- `APP_SECRET` est obligatoire ; s'il manque, le conteneur s'arrête. Exécutez `docker compose logs -f steam-monitor` pour consulter les erreurs de démarrage.
- Après avoir modifié `.env`, exécutez `docker compose up -d` pour que le conteneur soit recréé et prenne en compte les changements.
- Le processus de l'application s'exécute en tant qu'utilisateur non root ; un `HEALTHCHECK` intégré interroge `/api/health`.
- Mise à jour de l'image : `docker compose pull && docker compose up -d` ; build local avec `docker compose up -d --build` ; arrêt : `docker compose down` (les données sont conservées).
- Points d'attention pour le proxy inverse :
  - Le **corps brut de la requête** de `/webhooks/*` doit être transmis tel quel (ne pas le réécrire ni le resérialiser).
  - `client_max_body_size 1m`, délai de lecture ≥10s.
  - Les adresses Feishu / Lark / DingTalk utilisant un callback HTTP doivent être joignables publiquement en HTTPS ; Feishu / Lark, DingTalk Stream et le robot intelligent WeCom, qui utilisent des connexions longues sortantes, n'ont pas besoin d'adresse de callback.

## Configuration des canaux de notification

Ajoutez un canal dans la page « Canaux de notification » :

- **Robot de groupe WeCom** : Paramètres du groupe → Robots de groupe → Ajouter un robot, puis copiez le Webhook.
- **Robot personnalisé Feishu** : Paramètres du groupe → Robots de groupe → Robot personnalisé ; si la validation de signature est activée, renseignez également la clé de signature.
- **Robot personnalisé DingTalk** : Paramètres du groupe → Assistant de groupe intelligent → Ajouter un robot ; si la signature est activée, renseignez également la clé de signature.
- **WebHook personnalisé** : renseignez n'importe quelle interface HTTPS ; le système envoie les événements en JSON via POST, avec une clé de signature HMAC et un en-tête Authorization facultatifs.
- **SMTP** : renseignez le serveur, le port, SSL/TLS, l'expéditeur et les destinataires (plusieurs adresses séparées par des virgules).

Les clés sont stockées chiffrées en AES-256-GCM avec une clé dérivée de `APP_SECRET` ; l'API ne renvoie jamais le texte en clair ; laisser le champ vide lors de l'édition conserve la valeur existante.

Le format des requêtes, les champs du Payload et l'algorithme de signature du WebHook personnalisé sont décrits dans [docs/CUSTOM_WEBHOOK.fr.md](docs/CUSTOM_WEBHOOK.fr.md).

Ne cocher aucun « événement abonné » signifie recevoir tous les événements sauf « erreur de vérification ».

## Intégration des robots de commandes

Créez un robot dans la page « Robots de commandes » :

| Plateforme | Mode d'intégration | Description |
| --- | --- | --- |
| Feishu / Lark | Callback HTTP ou connexion longue WebSocket | Création de l'application en un clic par QR code, ou saisie manuelle de l'App ID / App Secret ; la connexion longue nécessite de choisir « Recevoir les événements via une connexion longue » sur la plateforme ouverte et de s'abonner à `im.message.receive_v1` |
| DingTalk | Callback HTTP ou connexion longue Stream | Création du robot en un clic par QR code, ou saisie manuelle du Client ID / Secret ; pour le callback HTTP, renseignez l'App Secret pour valider la signature ; le mode Stream ne nécessite aucune adresse publique |
| WeCom | Connexion longue WebSocket (aucune adresse de callback requise) | Créez un robot intelligent dans la console d'administration, choisissez le mode API → connexion longue, renseignez Bot ID / Secret ; le service se connecte activement à `wss://openws.work.weixin.qq.com` |

L'adresse de callback HTTP de Feishu / Lark est `POST /webhooks/feishu/<slug>` ; le mode callback prend en charge l'Encrypt Key / Verification Token, le mode connexion longue ne nécessite aucune adresse de callback publique. La « version » de la configuration permet de basculer entre Feishu (`open.feishu.cn`) et Lark international (`open.larksuite.com`).

**Ajout Feishu / Lark par QR code (recommandé)** : dans la page « Robots de commandes », cliquez sur **QR code Feishu / Lark**, choisissez « Feishu » ou « Lark international », scannez avec le client correspondant et suivez les instructions de la page pour créer l'application. Le système récupère automatiquement l'App ID / App Secret et enregistre l'`open_id` du scanneur comme identifiant de propriétaire ; le QR code est valable 10 minutes. L'application créée par QR code est une application `PersonalAgent`, avec les capacités de robot et l'abonnement aux événements de message préconfigurés ; après la création, vous pouvez rechercher le nom de l'application dans Feishu / Lark pour démarrer une conversation, ou l'ajouter à un groupe.

**Ajout DingTalk par QR code (recommandé)** : cliquez sur **Ajouter via QR code DingTalk**, scannez avec l'application mobile DingTalk, puis choisissez l'organisation et renseignez les informations du robot selon les instructions de la page. Le système récupère automatiquement le Client ID / Client Secret, utilise le Client ID comme Robot Code et active la connexion longue Stream ; le QR code est valable 10 minutes. Après la création, vous pouvez rechercher le robot dans DingTalk pour démarrer une conversation privée, ou l'ajouter à un groupe. Lorsqu'un membre l'utilise pour la première fois, il reçoit un lien d'autorisation Web ; il pourra l'utiliser après que le compte propriétaire du robot se sera connecté à la page Web et aura approuvé.

La connexion longue WeCom est établie activement par le serveur ; elle ne nécessite ni IP publique, ni Token, ni EncodingAESKey. Un même robot ne peut avoir qu'une seule connexion active à la fois ; en déploiement multi-instances, les instances se déconnectent mutuellement. L'ancienne configuration de callback des applications auto-construites WeCom est obsolète ; renseignez désormais le Bot ID / Secret du robot intelligent.

Vous pouvez également cliquer sur **Ajout via QR code WeCom** et scanner avec un compte WeCom disposant du droit de création ; le système récupère automatiquement le Bot ID / Secret, crée le robot et établit la connexion longue. Le QR code est valable 5 minutes. Lorsqu'un membre l'utilise pour la première fois, il reçoit un lien d'autorisation Web ; l'approbation se fait par le compte propriétaire du robot connecté à la page Web, ou l'utilisateur peut être ajouté directement à la liste d'autorisation.

Lorsque des utilisateurs non autorisés envoient des commandes sur Feishu / Lark, DingTalk ou WeCom, le robot répond avec un lien d'autorisation Web à usage unique et n'exécute pas la commande. Après que le compte propriétaire du robot s'est connecté à la page du lien, il peut choisir le rôle lecture seule ou administrateur pour cet utilisateur de la plateforme et approuver ; le lien est valable 30 minutes. `PUBLIC_BASE_URL` doit être accessible depuis le navigateur, sinon le lien ne s'ouvre pas.

Les robots de commandes peuvent également activer **Recevoir les notifications d'événements** dans leur page d'édition : une fois activé, les événements de sortie, de promotion, de délistage, etc. sont poussés vers la session utilisée par le dernier utilisateur autorisé de ce robot. L'utilisateur autorisé doit d'abord avoir envoyé au moins une commande dans la conversation pour que le système enregistre la cible de notification ; aucune notification n'est envoyée s'il n'y a pas de session récente. Les notifications d'événements DingTalk nécessitent également le remplissage de l'App Key, de l'App Secret et du Robot Code.

Les commandes du robot agissent toujours sur les données du **compte propriétaire du robot**. Tous les utilisateurs de la plateforme (y compris l'ID de propriétaire identifié lors du scan) doivent d'abord passer par l'autorisation Web ou être ajoutés à la liste d'autorisation ; sinon le robot renvoie uniquement un lien d'autorisation à usage unique et n'exécute pas la commande ; lors de l'approbation, vous pouvez choisir `viewer` (lecture seule) ou `admin`. L'ID de propriétaire ne sert désormais qu'à l'identification. Les étapes détaillées sont décrites dans [docs/BOT_INTEGRATION.fr.md](docs/BOT_INTEGRATION.fr.md).

L'intégration de WeChat ClawBot (iLink) et de QQ Bot est en cours selon les protocoles officiels des plateformes ; elles apparaîtront sur la même page une fois terminées.

### Commandes

```
/help
/add <appid | lien boutique | nom> [--discount N] [--note texte] [--force]
/adddlc <jeu de base> [--max 50]
/remove <id | appid>
/pause <id | appid>
/resume <id | appid>
/check <id | appid | nom>
/price <id | appid | nom>
/list [--all] [--sale] [--paused] [--page N]
/events [--item id] [--limit 10]
/cancel
```

Prise en charge de la barre oblique pleine largeur `／`, de `/add@bot`, des arguments entre guillemets et de `--flag=value`.

## Région et rebasage

La région est un paramètre au niveau de l'utilisateur. Lors d'un changement de région, tous les éléments surveillés existants de cet utilisateur sont rebasés : les ancres de promotion sont effacées, l'état est réinitialisé et le premier cycle de vérification ne fait qu'enregistrer un instantané sans produire d'événement, afin d'éviter de faux positifs dus aux écarts de prix entre régions. Les autres utilisateurs ne sont pas concernés.

## Réinitialisation du mot de passe

Exécutez dans le terminal du serveur (sans connexion Web) :

```bash
pnpm reset-password <utilisateur>
pnpm reset-password <utilisateur> --password 'new-password-123'
pnpm reset-password <utilisateur> --enable
```

Déploiement Docker :

```bash
docker compose exec steam-monitor node dist-server/reset-password.js <utilisateur>
```

- Sans `--password`, un mot de passe temporaire aléatoire est généré et affiché dans le terminal.
- Après la réinitialisation, `must_change_password=1` : l'utilisateur devra changer son mot de passe à sa prochaine connexion ; toutes ses sessions existantes sont invalidées.
- Un compte désactivé reste désactivé par défaut ; ajoutez `--enable` pour l'activer en même temps.
- La commande opère directement sur SQLite, sans dépendre de `APP_SECRET` ; elle localise la base de données via `DATA_DIR` / `DATABASE_PATH`.

## Sauvegarde et restauration

```bash
pnpm backup
```

Le script utilise `VACUUM INTO` pour générer `steam-monitor-YYYYMMDD-HHmm.db` dans `${DATA_DIR}/backups/` et conserve par défaut les 14 copies les plus récentes. Dans Docker, vous pouvez exécuter :

```bash
docker compose exec steam-monitor node_modules/.bin/tsx scripts/backup.ts
```

Procédure de restauration : arrêter le conteneur → remplacer `steam-monitor.db` par le fichier de sauvegarde → supprimer les fichiers `-wal` / `-shm` du même répertoire → démarrer le conteneur. **Sauvegardez également l'`APP_SECRET` de `.env`**, sinon les clés chiffrées des canaux et des robots ne pourront pas être restaurées et devront être saisies à nouveau.

## Tests

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm test:e2e   # installez d'abord les navigateurs Playwright : pnpm exec playwright install chromium
```

Les tests de bout en bout :

1. créent une base de données neuve dans `data/e2e`, démarrent le backend (4180), Vite (4181) et le service mock (9998) ;
2. utilisent l'API Steam mock pour piloter tout le cycle sortie, promotion, délistage et restauration ;
3. valident les notifications WeCom, le WebHook personnalisé, les e-mails SMTP, les callbacks Feishu / Lark / DingTalk et la configuration par QR code, les connexions longues Feishu / DingTalk / WeCom, ainsi que l'isolation multi-utilisateurs.

`scripts/mock-receiver.ts` peut également être exécuté seul, pour des tests d'intégration locaux :

```bash
pnpm mock:receiver
# Webhook de notification : http://127.0.0.1:9999/<chemin quelconque>
# Récepteur SMTP : 127.0.0.1:1025
# Résultats capturés : GET http://127.0.0.1:9999/_requests
# Simulation Steam : http://127.0.0.1:9999/steam-store et /steam-api
```

Avec `ALLOW_INSECURE_WEBHOOKS=1` et `STEAM_STORE_BASE_URL` / `STEAM_API_BASE_URL`, vous pouvez effectuer tous les tests d'intégration entièrement hors ligne.

## Limitations connues

- L'API de la boutique Steam est une API non officielle ; elle peut changer ou imposer des limites de débit ; il est impossible de distinguer « délisté / non vendable dans la région / appid invalide », le système utilise donc « déjà vendable + deux indisponibilités consécutives » pour réduire les faux positifs.
- L'alerte par mots-clés des actualités ne couvre que les actualités / annonces Steam ; il s'agit d'une indication heuristique qui nécessite une confirmation manuelle.
- Il est impossible de connaître l'heure exacte de fin d'une promotion ; `sale_end` dépend de la détection de la remise à zéro lors du prochain polling.
- Le robot de groupe WeCom peut uniquement envoyer ; pour les commandes en groupe, utilisez la connexion longue du robot intelligent WeCom. Une connexion longue ne prend en charge qu'une seule connexion active par robot ; en déploiement multi-instances, les instances se déconnectent mutuellement.
- WeChat ClawBot (iLink) et QQ Bot sont en cours d'intégration selon les protocoles officiels des plateformes.
- Déploiement mono-instance, SQLite à écrivain unique ; aucune haute disponibilité n'est fournie.
- Des régions utilisateur différentes entraînent la mise en cache et la récupération séparées d'un même jeu par région.

## Arborescence du projet

```
server/            application Hono, SQLite, collecte Steam, ordonnancement, notifications, callbacks / connexions longues des plateformes, commandes
shared/            types, constantes et schémas Zod partagés entre frontend et backend
src/               frontend Vue
scripts/           service mock, sauvegarde, script de démarrage E2E
e2e/               tests de bout en bout Playwright
Dockerfile         build multi-étapes (build du frontend et du serveur → uniquement les dépendances de production à l'exécution)
docker-compose.yml déploiement mono-service, montage bind de ./data sur l'hôte
data/              répertoire de données de l'hôte (SQLite, sauvegardes, journaux applicatifs logs/)
```
