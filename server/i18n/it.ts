import type { BotMessages } from './zh-CN'

export const it: BotMessages = {
  help: [
    'Comandi di Steam Sales Monitor',
    '/help — Mostra la guida',
    '/add <appid|link|nome> [--discount 20] [--note nota] [--force] — Aggiungi un monitoraggio',
    '/adddlc <appid base|link|nome> [--max 50] — Importa tutti i DLC',
    '/remove <id|appid|nome> — Rimuovi un monitoraggio',
    '/pause <id|appid|nome> — Sospendi i controlli',
    '/resume <id|appid|nome> — Riprendi i controlli',
    '/check <id|appid|nome> — Controlla ora',
    '/price <id|appid|nome> — Mostra il prezzo attuale',
    '/list [--all] [--sale] [--paused] [--page 2] — Elenca i monitoraggi',
    '/events [--item id] [--limit 10] — Mostra gli eventi recenti',
    '/cancel — Annulla una selezione in sospeso',
    '',
    'Gli osservatori possono usare /help /list /price /events; gli altri comandi richiedono i permessi di amministratore.',
  ].join('\n'),
  viewerDenied:
    'Non autorizzato: gli osservatori possono usare solo /help, /list, /price ed /events.',
  cancelDone: 'Selezione in sospeso annullata.',
  unexpected: 'Risultato imprevisto.',
  unknownCommandReply: 'Comando sconosciuto. Invia /help per la guida.',

  missingSlash: 'I comandi devono iniziare con /. Invia /help per la guida.',
  missingCommand: 'Nome del comando mancante. Invia /help per la guida.',
  unknownCommandWithName:
    'Comando sconosciuto /{command}. Invia /help per i comandi disponibili.',

  statusPaused: 'Sospeso',
  statusUnavailable: 'Non disponibile',
  statusDelistingSoon: 'Ritiro imminente',
  statusComingSoon: 'In arrivo',
  statusUnknown: 'In attesa di controllo',
  statusOnSale: 'In promozione',
  statusAvailable: 'In vendita',

  priceFree: 'Gratuito',
  priceWithDiscount: '{price} (-{discount} %)',
  priceNone: 'Nessun prezzo',

  monitorLine: '#{id} {name} ({appid}) · {status} · {price}',
  appidOnly: 'AppID: {appid}',
  appidWithParent: 'AppID: {appid} (DLC, gioco base {parent})',
  detailStatus: 'Stato: {status}',
  detailPrice: 'Prezzo: {price}',
  detailInitialPrice: 'Prezzo originale: {price}',
  detailReleaseDate: 'Data di uscita: {date}',
  detailMinDiscount: 'Sconto minimo: {discount}',
  followAccount: 'Valore dell’account',
  detailRegionLanguage: 'Regione / lingua: {region} / {language}',
  detailLastCheck: 'Ultimo controllo: {time}',
  neverChecked: 'Non ancora controllato',
  detailFailures: 'Errori consecutivi: {count}',
  detailNotes: 'Note: {notes}',
  detailStore: 'Negozio: {url}',

  eventLine: '{time} · {type} · {name}{suffix}',
  eventDiscountSuffix: ' · -{discount} %',
  eventRelease: 'Uscita del gioco',
  eventSaleStart: 'Promozione iniziata',
  eventSaleChange: 'Variazione di promozione',
  eventSaleEnd: 'Promozione terminata',
  eventPriceChange: 'Variazione di prezzo',
  eventDelistingWarning: 'Avviso delisting (euristico)',
  eventDelisted: 'Delistato / non acquistabile',
  eventRestored: 'Di nuovo in vendita',
  eventCheckError: 'Errore di controllo',

  addUsage: 'Uso: /add <appid|link|nome> [--discount 20] [--note nota] [--force]',
  addDlcUsage: 'Uso: /adddlc <appid base|link|nome> [--max 50]',
  discountInvalid: '--discount deve essere un numero intero da 0 a 100.',
  addAdded: 'Monitoraggio aggiunto: {name} ({appid})',
  addAddedStatus:
    'Stato attuale: {status} · Baseline registrata; le future modifiche saranno notificate.',
  addAlready: 'Già monitorato: {line}',
  appNotAvailable:
    'Questa app non è disponibile nella regione {region} (non trovata / ritirata / non venduta in questa regione).',
  addForceHint:
    'Per aggiungerla comunque, aggiungi --force; verranno usati solo gli avvisi delle notizie.',
  selectionPrompt:
    'Più risultati corrispondono a "{query}". Rispondi con un numero (valido per 10 minuti):',
  selectionInvalid:
    'Numero non valido. Rispondi da 1 a {count}, oppure invia /cancel per annullare.',
  selectionViewerDenied:
    'Non autorizzato: gli osservatori non possono aggiungere monitoraggi.',
  importDone: '{created} DLC importati, {skipped} saltati, {failed} non riusciti.',
  importNoDlc: 'L’app {appid} non ha DLC da importare.',

  quotaUser: 'Limite monitoraggi dell’account raggiunto ({limit}).',
  quotaSystem: 'Limite monitoraggi di sistema raggiunto ({limit}).',
  importQuotaUser:
    'Quota monitoraggi insufficiente: {current}/{limit} usati; al massimo {maxImport} DLC possono essere importati.',
  importQuotaSystem: 'Quota monitoraggi di sistema insufficiente (limite {limit}).',

  steamNetwork: 'Impossibile raggiungere lo store Steam. Riprova più tardi.',
  steamTimeout: 'Lo store Steam ha impiegato troppo tempo. Riprova più tardi.',
  steamRateLimited: 'Le richieste a Steam sono limitate. Riprova più tardi.',
  steamError: 'Richiesta a Steam non riuscita ({code}).',
  onboardingRequired: 'Completa prima la configurazione di regione e lingua.',
  searchNotFound: 'Nessun gioco trovato per "{query}".',
  unknownError: 'Errore sconosciuto',

  checkDone: 'Controllo completato; {count} nuovi eventi.',
  checkDoneCached: 'Controllo completato (dalla cache); {count} nuovi eventi.',
  checkNotFound:
    'Steam non ha restituito questa app (potrebbe essere ritirata o non disponibile in questa regione).',
  checkSkipped: 'Saltato: il monitoraggio non esiste o l’account è disabilitato.',
  checkFailed: 'Controllo non riuscito: {code}',

  listEmpty: 'Nessun monitoraggio. Usa /add per aggiungerne uno.',
  listNoMore: 'Nessun altro monitoraggio.',
  listHeader: 'Monitoraggi (pagina {page}, {total} totali):',

  usageTarget: 'Uso: /{command} <id|appid|nome>',
  provideTarget: 'Indica un ID monitoraggio, un AppID o un nome.',
  notFoundRemove: 'Nessun monitoraggio da rimuovere corrisponde a "{query}".',
  notFoundPause: 'Nessun monitoraggio da sospendere corrisponde a "{query}".',
  notFoundResume: 'Nessun monitoraggio da riprendere corrisponde a "{query}".',
  notFoundCheck: 'Nessun monitoraggio da controllare corrisponde a "{query}".',
  notFoundPrice: 'Nessun monitoraggio da consultare corrisponde a "{query}".',
  manyMatches:
    '"{query}" corrisponde a più monitoraggi. Usa un ID o un AppID:',
  removed: 'Monitoraggio rimosso: {line}',
  paused: 'Sospeso: {line}',
  resumed: 'Ripreso: {line}',

  eventsNotFound: 'Nessun monitoraggio corrisponde a "{item}".',
  eventsMany:
    'Più monitoraggi corrispondono alla ricerca eventi. Usa un ID o un AppID.',
  eventsEmpty: 'Nessun evento.',
  eventsHeader: 'Eventi recenti:',

  appName: 'Steam Monitor',
  notificationTitle: '[{label}] {name}',
  notificationFooter: '{app} · {time}',
  notificationViewOnSteam: 'Apri su Steam',
  notificationEntry: 'Elemento: {name} (appid {appid})',
  notificationRegion: 'Regione: {region}',
  notificationReleased: '"{name}" è stato pubblicato.',
  notificationReleaseDate: 'Data di uscita: {date}',
  notificationCurrentPrice: 'Prezzo attuale: {price}',
  notificationThresholdReached: 'Soglia di monitoraggio raggiunta: {threshold}%',
  notificationDiscountChange: 'Variazione sconto: {old}% → {new}%',
  notificationPriceChange: 'Variazione prezzo: {old} → {new}',
  notificationSaleEnded: 'Promozione terminata; prezzo tornato normale.',
  notificationSaleEndedWithPrice: 'Promozione terminata; prezzo tornato a {price}.',
  notificationPreviousDiscount: 'Sconto precedente: {discount}%',
  notificationBecameFree: 'Questo elemento ora è gratuito.',
  notificationBecamePaid: 'Questo elemento non è più gratuito.',
  notificationBecamePaidWithPrice: 'Questo elemento non è più gratuito: {price}.',
  notificationBasePriceChange: 'Variazione prezzo base: {old} → {new}',
  notificationSteamNews: 'Notizia Steam: "{title}"',
  notificationMatchedKeyword: 'Parola chiave rilevata: {keyword}',
  notificationDelistingHint:
    'Questo è un avviso euristico basato su parole chiave delle notizie. Verifica manualmente se l’elemento verrà ritirato.',
  notificationNewsLink: 'Link della notizia: {url}',
  notificationDelistedConfirmed:
    'Due controlli consecutivi hanno confermato che questo elemento non è acquistabile nello store.',
  notificationRestoredFirst: 'Questo elemento ora è acquistabile nella regione {region}.',
  notificationRestored: 'Questo elemento è di nuovo acquistabile (regione {region}).',
  notificationCheckFailed: '{count} controlli consecutivi non riusciti ({code}).',
  notificationAutoPaused:
    'Questo monitoraggio è stato sospeso automaticamente; controllalo e riprendilo manualmente.',
  notificationSteamNewsFallback: 'Notizia Steam',
  notificationTestTitle: '[Test] Steam Monitor',
  notificationTestChannelOk: 'Canale di notifica "{channel}" configurato correttamente.',
  notificationTestHint:
    'Se hai ricevuto questo messaggio, il canale può ricevere le notifiche di monitoraggio.',

  ownerMissing: 'L’account proprietario del bot non esiste.',
  decryptFailed:
    'Impossibile decifrare le credenziali del bot. Chiedi a un amministratore di reinserire la configurazione.',
  throttled:
    'Troppe richieste. Riprova più tardi (massimo 10 comandi al minuto).',
  unauthorized:
    'Non autorizzato. Chiedi al proprietario del bot di aggiungere il tuo ID piattaforma alla lista consentita.',
  authorizePrompt:
    'Non hai ancora il permesso di usare "{bot}". Invia il link seguente al proprietario del bot; se sei il proprietario, accedi all’interfaccia web e approva (valido per 30 minuti):',
}
