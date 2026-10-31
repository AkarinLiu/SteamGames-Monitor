import type { BotMessages } from './zh-CN'

export const nl: BotMessages = {
  help: [
    'Steam-verkoopmonitor-opdrachten',
    '/help — Hulp tonen',
    '/add <appid|link|naam> [--discount 20] [--note notitie] [--force] — Monitor toevoegen',
    '/adddlc <basis-appid|link|naam> [--max 50] — Alle DLC importeren',
    '/remove <id|appid|naam> — Monitor verwijderen',
    '/pause <id|appid|naam> — Controles pauzeren',
    '/resume <id|appid|naam> — Controles hervatten',
    '/check <id|appid|naam> — Nu controleren',
    '/price <id|appid|naam> — Huidige prijs tonen',
    '/list [--all] [--sale] [--paused] [--page 2] — Monitors tonen',
    '/events [--item id] [--limit 10] — Recente gebeurtenissen tonen',
    '/cancel — Openstaande selectie annuleren',
    '',
    'Kijkers kunnen /help /list /price /events gebruiken; andere opdrachten vereisen beheerdersrechten.',
  ].join('\n'),
  viewerDenied:
    'Niet geautoriseerd: kijkers kunnen alleen /help, /list, /price en /events gebruiken.',
  cancelDone: 'Openstaande selectie geannuleerd.',
  unexpected: 'Onverwacht resultaat.',
  unknownCommandReply: 'Onbekende opdracht. Stuur /help voor de hulp.',

  missingSlash: 'Opdrachten moeten met / beginnen. Stuur /help voor de hulp.',
  missingCommand: 'Opdrachtnaam ontbreekt. Stuur /help voor de hulp.',
  unknownCommandWithName:
    'Onbekende opdracht /{command}. Stuur /help voor beschikbare opdrachten.',

  statusPaused: 'Gepauzeerd',
  statusUnavailable: 'Niet beschikbaar',
  statusDelistingSoon: 'Binnenkort uit verkoop',
  statusComingSoon: 'Binnenkort beschikbaar',
  statusUnknown: 'Te controleren',
  statusOnSale: 'In de aanbieding',
  statusAvailable: 'Te koop',

  priceFree: 'Gratis',
  priceWithDiscount: '{price} (-{discount}%)',
  priceNone: 'Geen prijs',

  monitorLine: '#{id} {name} ({appid}) · {status} · {price}',
  appidOnly: 'AppID: {appid}',
  appidWithParent: 'AppID: {appid} (DLC, basisspel {parent})',
  detailStatus: 'Status: {status}',
  detailPrice: 'Prijs: {price}',
  detailInitialPrice: 'Oorspronkelijke prijs: {price}',
  detailReleaseDate: 'Releasedatum: {date}',
  detailMinDiscount: 'Minimale korting: {discount}',
  followAccount: 'Accountstandaard',
  detailRegionLanguage: 'Regio / taal: {region} / {language}',
  detailLastCheck: 'Laatste controle: {time}',
  neverChecked: 'Nog niet gecontroleerd',
  detailFailures: 'Opeenvolgende fouten: {count}',
  detailNotes: 'Notities: {notes}',
  detailStore: 'Winkel: {url}',

  eventLine: '{time} · {type} · {name}{suffix}',
  eventDiscountSuffix: ' · -{discount}%',
  eventRelease: 'Game uitgebracht',
  eventSaleStart: 'Aanbieding gestart',
  eventSaleChange: 'Aanbiedingswijziging',
  eventSaleEnd: 'Aanbieding beëindigd',
  eventPriceChange: 'Prijsverandering',
  eventDelistingWarning: 'Waarschuwing niet meer beschikbaar (heuristisch)',
  eventDelisted: 'Niet meer beschikbaar / niet te koop',
  eventRestored: 'Weer te koop',
  eventCheckError: 'Controlefout',

  addUsage: 'Gebruik: /add <appid|link|naam> [--discount 20] [--note notitie] [--force]',
  addDlcUsage: 'Gebruik: /adddlc <basis-appid|link|naam> [--max 50]',
  discountInvalid: '--discount moet een geheel getal van 0 tot 100 zijn.',
  addAdded: 'Monitor toegevoegd: {name} ({appid})',
  addAddedStatus:
    'Huidige status: {status} · Basis vastgelegd; toekomstige wijzigingen worden gemeld.',
  addAlready: 'Al in de gaten gehouden: {line}',
  appNotAvailable:
    'Deze app is niet beschikbaar in regio {region} (niet gevonden / verwijderd / niet verkocht in deze regio).',
  addForceHint:
    'Voeg --force toe om deze toch toe te voegen; er worden dan alleen nieuwswaarschuwingen gebruikt.',
  selectionPrompt:
    'Meerdere resultaten komen overeen met "{query}". Antwoord met een nummer (10 minuten geldig):',
  selectionInvalid:
    'Ongeldig nummer. Antwoord met 1-{count}, of stuur /cancel om te annuleren.',
  selectionViewerDenied:
    'Niet geautoriseerd: kijkers kunnen geen monitors toevoegen.',
  importDone: '{created} DLC geïmporteerd, {skipped} overgeslagen, {failed} mislukt.',
  importNoDlc: 'App {appid} heeft geen DLC om te importeren.',

  quotaUser: 'Limiet voor monitors van het account bereikt ({limit}).',
  quotaSystem: 'Systeemlimiet voor monitors bereikt ({limit}).',
  importQuotaUser:
    'Onvoldoende monitorquota: {current}/{limit} gebruikt; maximaal {maxImport} DLC kan worden geïmporteerd.',
  importQuotaSystem: 'Onvoldoende systeemquota voor monitors (limiet {limit}).',

  steamNetwork: 'Kan de Steam-winkel niet bereiken. Probeer het later opnieuw.',
  steamTimeout: 'De Steam-winkel reageerde niet op tijd. Probeer het later opnieuw.',
  steamRateLimited: 'Steam-aanvragen zijn beperkt. Probeer het later opnieuw.',
  steamError: 'Steam-aanvraag mislukt ({code}).',
  onboardingRequired: 'Voltooi eerst de regio- en taalinstellingen.',
  searchNotFound: 'Geen game gevonden voor "{query}".',
  unknownError: 'Onbekende fout',

  checkDone: 'Controle voltooid; {count} nieuwe gebeurtenis(sen).',
  checkDoneCached: 'Controle voltooid (uit cache); {count} nieuwe gebeurtenis(sen).',
  checkNotFound:
    'Steam heeft deze app niet teruggegeven (mogelijk verwijderd of niet beschikbaar in deze regio).',
  checkSkipped: 'Overgeslagen: de monitor bestaat niet of het account is uitgeschakeld.',
  checkFailed: 'Controle mislukt: {code}',

  listEmpty: 'Nog geen monitors. Gebruik /add om er een toe te voegen.',
  listNoMore: 'Geen verdere monitors.',
  listHeader: 'Monitors (pagina {page}, {total} totaal):',

  usageTarget: 'Gebruik: /{command} <id|appid|naam>',
  provideTarget: 'Geef een monitor-ID, AppID of naam op.',
  notFoundRemove: 'Geen monitor gevonden om te verwijderen voor "{query}".',
  notFoundPause: 'Geen monitor gevonden om te pauzeren voor "{query}".',
  notFoundResume: 'Geen monitor gevonden om te hervatten voor "{query}".',
  notFoundCheck: 'Geen monitor gevonden om te controleren voor "{query}".',
  notFoundPrice: 'Geen monitor gevonden om op te vragen voor "{query}".',
  manyMatches:
    '"{query}" komt overeen met meerdere monitors. Gebruik een ID of AppID:',
  removed: 'Monitor verwijderd: {line}',
  paused: 'Gepauzeerd: {line}',
  resumed: 'Hervat: {line}',

  eventsNotFound: 'Geen monitor gevonden voor "{item}".',
  eventsMany:
    'Meerdere monitors komen overeen met de gebeurtenisquery. Gebruik een ID of AppID.',
  eventsEmpty: 'Nog geen gebeurtenissen.',
  eventsHeader: 'Recente gebeurtenissen:',

  ownerMissing: 'Het eigenaarsaccount van de bot bestaat niet.',
  decryptFailed:
    'De inloggegevens van de bot kunnen niet worden ontsleuteld. Laat een beheerder de configuratie opnieuw invoeren.',
  throttled:
    'Te veel aanvragen. Probeer het later opnieuw (maximaal 10 opdrachten per minuut).',
  unauthorized:
    'Niet geautoriseerd. Vraag de bot-eigenaar om je platform-ID aan de allowlist toe te voegen.',
  authorizePrompt:
    'Je hebt nog geen toestemming om "{bot}" te gebruiken. Stuur de onderstaande link naar de bot-eigenaar; ben je de eigenaar, log dan in op de webinterface en keur het goed (30 minuten geldig):',
}
