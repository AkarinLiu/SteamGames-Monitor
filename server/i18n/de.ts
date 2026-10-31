import type { BotMessages } from './zh-CN'

export const de: BotMessages = {
  help: [
    'Steam-Verkaufsmonitor – Befehle',
    '/help — Hilfe anzeigen',
    '/add <AppID|Link|Name> [--discount 20] [--note Notiz] [--force] — Monitor hinzufügen',
    '/adddlc <Basis-AppID|Link|Name> [--max 50] — Alle DLCs importieren',
    '/remove <ID|AppID|Name> — Monitor entfernen',
    '/pause <ID|AppID|Name> — Prüfung pausieren',
    '/resume <ID|AppID|Name> — Prüfung fortsetzen',
    '/check <ID|AppID|Name> — Jetzt prüfen',
    '/price <ID|AppID|Name> — Aktuellen Preis anzeigen',
    '/list [--all] [--sale] [--paused] [--page 2] — Monitore auflisten',
    '/events [--item ID] [--limit 10] — Letzte Ereignisse anzeigen',
    '/cancel — Ausstehende Auswahl abbrechen',
    '',
    'Betrachter können /help /list /price /events nutzen; alle anderen Befehle erfordern Admin-Rechte.',
  ].join('\n'),
  viewerDenied:
    'Nicht autorisiert: Betrachter können nur /help, /list, /price und /events nutzen.',
  cancelDone: 'Ausstehende Auswahl abgebrochen.',
  unexpected: 'Unerwartetes Ergebnis.',
  unknownCommandReply: 'Unbekannter Befehl. Sende /help für die Hilfe.',

  missingSlash: 'Befehle müssen mit / beginnen. Sende /help für die Hilfe.',
  missingCommand: 'Befehlsname fehlt. Sende /help für die Hilfe.',
  unknownCommandWithName: 'Unbekannter Befehl /{command}. Sende /help für verfügbare Befehle.',

  statusPaused: 'Pausiert',
  statusUnavailable: 'Nicht verfügbar',
  statusDelistingSoon: 'Bald nicht mehr erhältlich',
  statusComingSoon: 'Demnächst',
  statusUnknown: 'Prüfung ausstehend',
  statusOnSale: 'Im Angebot',
  statusAvailable: 'Im Verkauf',

  priceFree: 'Kostenlos',
  priceWithDiscount: '{price} (-{discount} %)',
  priceNone: 'Kein Preis',

  monitorLine: '#{id} {name} ({appid}) · {status} · {price}',
  appidOnly: 'AppID: {appid}',
  appidWithParent: 'AppID: {appid} (DLC, Basisspiel {parent})',
  detailStatus: 'Status: {status}',
  detailPrice: 'Preis: {price}',
  detailInitialPrice: 'Ursprünglicher Preis: {price}',
  detailReleaseDate: 'Veröffentlichung: {date}',
  detailMinDiscount: 'Mindestrabatt: {discount}',
  followAccount: 'Kontostandard',
  detailRegionLanguage: 'Region / Sprache: {region} / {language}',
  detailLastCheck: 'Letzte Prüfung: {time}',
  neverChecked: 'Noch nicht geprüft',
  detailFailures: 'Fehlgeschlagene Prüfungen in Folge: {count}',
  detailNotes: 'Notizen: {notes}',
  detailStore: 'Shop: {url}',

  eventLine: '{time} · {type} · {name}{suffix}',
  eventDiscountSuffix: ' · -{discount} %',
  eventRelease: 'Spiel-Release',
  eventSaleStart: 'Angebot gestartet',
  eventSaleChange: 'Angebotsänderung',
  eventSaleEnd: 'Angebot beendet',
  eventPriceChange: 'Preisänderung',
  eventDelistingWarning: 'Delisting-Warnung (heuristisch)',
  eventDelisted: 'Delistet / nicht kaufbar',
  eventRestored: 'Wieder kaufbar',
  eventCheckError: 'Prüffehler',

  addUsage: 'Verwendung: /add <AppID|Link|Name> [--discount 20] [--note Notiz] [--force]',
  addDlcUsage: 'Verwendung: /adddlc <Basis-AppID|Link|Name> [--max 50]',
  discountInvalid: '--discount muss eine ganze Zahl von 0 bis 100 sein.',
  addAdded: 'Monitor hinzugefügt: {name} ({appid})',
  addAddedStatus:
    'Aktueller Status: {status} · Baseline gespeichert; künftige Änderungen werden gemeldet.',
  addAlready: 'Wird bereits überwacht: {line}',
  appNotAvailable:
    'Diese App ist in Region {region} nicht verfügbar (nicht gefunden / delistet / in dieser Region nicht erhältlich).',
  addForceHint:
    'Zum Hinzufügen trotzdem --force anhängen; dann werden nur News-Warnungen genutzt.',
  selectionPrompt:
    'Mehrere Ergebnisse passen zu "{query}". Antworte mit einer Nummer (10 Minuten gültig):',
  selectionInvalid:
    'Ungültige Nummer. Antworte mit 1-{count} oder sende /cancel zum Abbrechen.',
  selectionViewerDenied: 'Nicht autorisiert: Betrachter können keine Monitore hinzufügen.',
  importDone: '{created} DLC(s) importiert, {skipped} übersprungen, {failed} fehlgeschlagen.',
  importNoDlc: 'App {appid} hat keine importierbaren DLCs.',

  quotaUser: 'Kontolimit für Monitore erreicht ({limit}).',
  quotaSystem: 'Systemlimit für Monitore erreicht ({limit}).',
  importQuotaUser:
    'Monitor-Kontingent nicht ausreichend: {current}/{limit} belegt; maximal {maxImport} DLC(s) können importiert werden.',
  importQuotaSystem: 'Systemweites Monitor-Kontingent nicht ausreichend (Limit {limit}).',

  steamNetwork: 'Der Steam-Shop ist nicht erreichbar. Bitte später erneut versuchen.',
  steamTimeout: 'Zeitüberschreitung beim Steam-Shop. Bitte später erneut versuchen.',
  steamRateLimited: 'Steam-Anfragen sind limitiert. Bitte später erneut versuchen.',
  steamError: 'Steam-Anfrage fehlgeschlagen ({code}).',
  onboardingRequired: 'Bitte zuerst Region und Sprache einrichten.',
  searchNotFound: 'Kein Spiel zu "{query}" gefunden.',
  unknownError: 'Unbekannter Fehler',

  checkDone: 'Prüfung abgeschlossen; {count} neue(s) Ereignis(se).',
  checkDoneCached: 'Prüfung abgeschlossen (aus Cache); {count} neue(s) Ereignis(se).',
  checkNotFound:
    'Steam hat diese App nicht zurückgegeben (möglicherweise delistet oder in dieser Region nicht verfügbar).',
  checkSkipped: 'Übersprungen: Monitor existiert nicht oder das Konto ist deaktiviert.',
  checkFailed: 'Prüfung fehlgeschlagen: {code}',

  listEmpty: 'Noch keine Monitore. Nutze /add zum Hinzufügen.',
  listNoMore: 'Keine weiteren Monitore.',
  listHeader: 'Monitore (Seite {page}, insgesamt {total}):',

  usageTarget: 'Verwendung: /{command} <ID|AppID|Name>',
  provideTarget: 'Bitte Monitor-ID, AppID oder Namen angeben.',
  notFoundRemove: 'Kein Monitor zum Entfernen für "{query}" gefunden.',
  notFoundPause: 'Kein Monitor zum Pausieren für "{query}" gefunden.',
  notFoundResume: 'Kein Monitor zum Fortsetzen für "{query}" gefunden.',
  notFoundCheck: 'Kein Monitor zum Prüfen für "{query}" gefunden.',
  notFoundPrice: 'Kein Monitor zum Abfragen für "{query}" gefunden.',
  manyMatches: '"{query}" passt zu mehreren Monitoren. Bitte ID oder AppID verwenden:',
  removed: 'Monitor entfernt: {line}',
  paused: 'Pausiert: {line}',
  resumed: 'Fortgesetzt: {line}',

  eventsNotFound: 'Kein Monitor für "{item}" gefunden.',
  eventsMany:
    'Mehrere Monitore passen zur Ereignisabfrage. Bitte ID oder AppID verwenden.',
  eventsEmpty: 'Noch keine Ereignisse.',
  eventsHeader: 'Letzte Ereignisse:',

  ownerMissing: 'Das Besitzerkonto des Bots existiert nicht.',
  decryptFailed:
    'Die Bot-Zugangsdaten können nicht entschlüsselt werden. Bitte einen Administrator die Konfiguration erneut eingeben lassen.',
  throttled:
    'Zu viele Anfragen. Bitte später erneut versuchen (maximal 10 Befehle pro Minute).',
  unauthorized:
    'Nicht autorisiert. Bitte den Bot-Besitzer, deine Plattform-ID zur Allowlist hinzuzufügen.',
  authorizePrompt:
    'Du hast noch keine Berechtigung für "{bot}". Sende den folgenden Link an den Bot-Besitzer; wenn du der Besitzer bist, melde dich in der Weboberfläche an und bestätige (30 Minuten gültig):',
}
