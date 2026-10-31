import type { BotMessages } from './zh-CN'

export const fr: BotMessages = {
  help: [
    'Commandes de Steam Sales Monitor',
    '/help — Afficher l’aide',
    '/add <appid|lien|nom> [--discount 20] [--note note] [--force] — Ajouter un suivi',
    '/adddlc <appid de base|lien|nom> [--max 50] — Importer tous les DLC',
    '/remove <id|appid|nom> — Supprimer un suivi',
    '/pause <id|appid|nom> — Suspendre les vérifications',
    '/resume <id|appid|nom> — Reprendre les vérifications',
    '/check <id|appid|nom> — Vérifier maintenant',
    '/price <id|appid|nom> — Afficher le prix actuel',
    '/list [--all] [--sale] [--paused] [--page 2] — Lister les suivis',
    '/events [--item id] [--limit 10] — Afficher les événements récents',
    '/cancel — Annuler une sélection en attente',
    '',
    'Les observateurs peuvent utiliser /help /list /price /events ; les autres commandes nécessitent les droits d’administration.',
  ].join('\n'),
  viewerDenied:
    'Non autorisé : les observateurs peuvent uniquement utiliser /help, /list, /price et /events.',
  cancelDone: 'Sélection en attente annulée.',
  unexpected: 'Résultat inattendu.',
  unknownCommandReply: 'Commande inconnue. Envoyez /help pour l’aide.',

  missingSlash: 'Les commandes doivent commencer par /. Envoyez /help pour l’aide.',
  missingCommand: 'Nom de commande manquant. Envoyez /help pour l’aide.',
  unknownCommandWithName:
    'Commande inconnue /{command}. Envoyez /help pour voir les commandes disponibles.',

  statusPaused: 'Suspendu',
  statusUnavailable: 'Indisponible',
  statusDelistingSoon: 'Retrait imminent',
  statusComingSoon: 'Bientôt disponible',
  statusUnknown: 'En attente de vérification',
  statusOnSale: 'En promotion',
  statusAvailable: 'En vente',

  priceFree: 'Gratuit',
  priceWithDiscount: '{price} (-{discount} %)',
  priceNone: 'Aucun prix',

  monitorLine: '#{id} {name} ({appid}) · {status} · {price}',
  appidOnly: 'AppID : {appid}',
  appidWithParent: 'AppID : {appid} (DLC, jeu de base {parent})',
  detailStatus: 'Statut : {status}',
  detailPrice: 'Prix : {price}',
  detailInitialPrice: 'Prix initial : {price}',
  detailReleaseDate: 'Date de sortie : {date}',
  detailMinDiscount: 'Réduction minimale : {discount}',
  followAccount: 'Valeur du compte',
  detailRegionLanguage: 'Région / langue : {region} / {language}',
  detailLastCheck: 'Dernière vérification : {time}',
  neverChecked: 'Pas encore vérifié',
  detailFailures: 'Échecs consécutifs : {count}',
  detailNotes: 'Notes : {notes}',
  detailStore: 'Boutique : {url}',

  eventLine: '{time} · {type} · {name}{suffix}',
  eventDiscountSuffix: ' · -{discount} %',
  eventRelease: 'Sortie de jeu',
  eventSaleStart: 'Début de promotion',
  eventSaleChange: 'Changement de promotion',
  eventSaleEnd: 'Fin de promotion',
  eventPriceChange: 'Variation de prix',
  eventDelistingWarning: 'Alerte de retrait (heuristique)',
  eventDelisted: 'Retiré / non disponible à l’achat',
  eventRestored: 'De nouveau en vente',
  eventCheckError: 'Anomalie de vérification',

  addUsage: 'Utilisation : /add <appid|lien|nom> [--discount 20] [--note note] [--force]',
  addDlcUsage: 'Utilisation : /adddlc <appid de base|lien|nom> [--max 50]',
  discountInvalid: '--discount doit être un entier de 0 à 100.',
  addAdded: 'Suivi ajouté : {name} ({appid})',
  addAddedStatus:
    'Statut actuel : {status} · Référence enregistrée ; les futures variations seront notifiées.',
  addAlready: 'Déjà suivi : {line}',
  appNotAvailable:
    'Cette application est indisponible dans la région {region} (introuvable / retirée / non vendue dans cette région).',
  addForceHint:
    'Pour l’ajouter quand même, ajoutez --force ; seules les alertes d’actualités seront utilisées.',
  selectionPrompt:
    'Plusieurs résultats correspondent à « {query} ». Répondez avec un numéro (valide 10 minutes) :',
  selectionInvalid:
    'Numéro invalide. Répondez de 1 à {count}, ou envoyez /cancel pour annuler.',
  selectionViewerDenied:
    'Non autorisé : les observateurs ne peuvent pas ajouter de suivis.',
  importDone: '{created} DLC importé(s), {skipped} ignoré(s), {failed} échoué(s).',
  importNoDlc: 'L’app {appid} ne contient aucun DLC à importer.',

  quotaUser: 'Limite de suivis du compte atteinte ({limit}).',
  quotaSystem: 'Limite système de suivis atteinte ({limit}).',
  importQuotaUser:
    'Quota de suivis insuffisant : {current}/{limit} utilisés ; au maximum {maxImport} DLC peuvent être importés.',
  importQuotaSystem: 'Quota système de suivis insuffisant (limite {limit}).',

  steamNetwork: 'Impossible de joindre la boutique Steam. Réessayez plus tard.',
  steamTimeout: 'La boutique Steam a expiré. Réessayez plus tard.',
  steamRateLimited: 'Les requêtes Steam sont limitées. Réessayez plus tard.',
  steamError: 'Échec de la requête Steam ({code}).',
  onboardingRequired: 'Terminez d’abord la configuration de la région et de la langue.',
  searchNotFound: 'Aucun jeu trouvé pour « {query} ».',
  unknownError: 'Erreur inconnue',

  checkDone: 'Vérification terminée ; {count} nouvel(s) événement(s).',
  checkDoneCached: 'Vérification terminée (depuis le cache) ; {count} nouvel(s) événement(s).',
  checkNotFound:
    'Steam n’a pas renvoyé cette application (peut-être retirée ou indisponible dans cette région).',
  checkSkipped: 'Ignoré : le suivi n’existe pas ou le compte est désactivé.',
  checkFailed: 'Échec de la vérification : {code}',

  listEmpty: 'Aucun suivi pour l’instant. Utilisez /add pour en ajouter.',
  listNoMore: 'Aucun autre suivi.',
  listHeader: 'Suivis (page {page}, {total} au total) :',

  usageTarget: 'Utilisation : /{command} <id|appid|nom>',
  provideTarget: 'Indiquez un ID de suivi, un AppID ou un nom.',
  notFoundRemove: 'Aucun suivi à supprimer ne correspond à « {query} ».',
  notFoundPause: 'Aucun suivi à suspendre ne correspond à « {query} ».',
  notFoundResume: 'Aucun suivi à reprendre ne correspond à « {query} ».',
  notFoundCheck: 'Aucun suivi à vérifier ne correspond à « {query} ».',
  notFoundPrice: 'Aucun suivi à consulter ne correspond à « {query} ».',
  manyMatches:
    '« {query} » correspond à plusieurs suivis. Utilisez un ID ou un AppID :',
  removed: 'Suivi supprimé : {line}',
  paused: 'Suspendu : {line}',
  resumed: 'Repris : {line}',

  eventsNotFound: 'Aucun suivi ne correspond à « {item} ».',
  eventsMany:
    'Plusieurs suivis correspondent à la requête d’événements. Utilisez un ID ou un AppID.',
  eventsEmpty: 'Aucun événement pour l’instant.',
  eventsHeader: 'Événements récents :',

  ownerMissing: 'Le compte propriétaire du bot n’existe pas.',
  decryptFailed:
    'Les identifiants du bot ne peuvent pas être déchiffrés. Demandez à un administrateur de saisir à nouveau la configuration.',
  throttled:
    'Trop de requêtes. Réessayez plus tard (maximum 10 commandes par minute).',
  unauthorized:
    'Non autorisé. Demandez au propriétaire du bot d’ajouter votre ID de plateforme à la liste autorisée.',
  authorizePrompt:
    'Vous n’avez pas encore l’autorisation d’utiliser « {bot} ». Envoyez le lien ci-dessous au propriétaire du bot ; si vous êtes le propriétaire, connectez-vous à l’interface web et approuvez-le (valide 30 minutes) :',
}
