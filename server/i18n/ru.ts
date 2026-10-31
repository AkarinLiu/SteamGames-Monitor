import type { BotMessages } from './zh-CN'

export const ru: BotMessages = {
  help: [
    'Команды монитора продаж Steam',
    '/help — Показать справку',
    '/add <appid|ссылка|название> [--discount 20] [--note заметка] [--force] — Добавить мониторинг',
    '/adddlc <appid базовой игры|ссылка|название> [--max 50] — Импортировать все DLC',
    '/remove <id|appid|название> — Удалить мониторинг',
    '/pause <id|appid|название> — Приостановить проверки',
    '/resume <id|appid|название> — Возобновить проверки',
    '/check <id|appid|название> — Проверить сейчас',
    '/price <id|appid|название> — Показать текущую цену',
    '/list [--all] [--sale] [--paused] [--page 2] — Список мониторингов',
    '/events [--item id] [--limit 10] — Последние события',
    '/cancel — Отменить ожидающий выбор',
    '',
    'Наблюдатели могут использовать /help /list /price /events; остальные команды требуют прав администратора.',
  ].join('\n'),
  viewerDenied:
    'Нет доступа: наблюдатели могут использовать только /help, /list, /price и /events.',
  cancelDone: 'Ожидающий выбор отменён.',
  unexpected: 'Неожиданный результат.',
  unknownCommandReply: 'Неизвестная команда. Отправьте /help для справки.',

  missingSlash: 'Команда должна начинаться с /. Отправьте /help для справки.',
  missingCommand: 'Не указано имя команды. Отправьте /help для справки.',
  unknownCommandWithName:
    'Неизвестная команда /{command}. Отправьте /help, чтобы увидеть доступные команды.',

  statusPaused: 'Приостановлено',
  statusUnavailable: 'Недоступно',
  statusDelistingSoon: 'Скоро снятие с продажи',
  statusComingSoon: 'Скоро выйдет',
  statusUnknown: 'Ожидает проверки',
  statusOnSale: 'Идёт скидка',
  statusAvailable: 'В продаже',

  priceFree: 'Бесплатно',
  priceWithDiscount: '{price} (-{discount}%)',
  priceNone: 'Нет цены',

  monitorLine: '#{id} {name} ({appid}) · {status} · {price}',
  appidOnly: 'AppID: {appid}',
  appidWithParent: 'AppID: {appid} (DLC, базовая игра {parent})',
  detailStatus: 'Статус: {status}',
  detailPrice: 'Цена: {price}',
  detailInitialPrice: 'Исходная цена: {price}',
  detailReleaseDate: 'Дата выхода: {date}',
  detailMinDiscount: 'Минимальная скидка: {discount}',
  followAccount: 'Как в настройках аккаунта',
  detailRegionLanguage: 'Регион / язык: {region} / {language}',
  detailLastCheck: 'Последняя проверка: {time}',
  neverChecked: 'Ещё не проверялось',
  detailFailures: 'Неудачных проверок подряд: {count}',
  detailNotes: 'Заметки: {notes}',
  detailStore: 'Магазин: {url}',

  eventLine: '{time} · {type} · {name}{suffix}',
  eventDiscountSuffix: ' · -{discount}%',
  eventRelease: 'Выход игры',
  eventSaleStart: 'Скидка началась',
  eventSaleChange: 'Изменение скидки',
  eventSaleEnd: 'Скидка завершена',
  eventPriceChange: 'Изменение цены',
  eventDelistingWarning: 'Предупреждение о снятии с продажи (эвристика)',
  eventDelisted: 'Снято с продажи / недоступно',
  eventRestored: 'Снова в продаже',
  eventCheckError: 'Ошибка проверки',

  addUsage:
    'Использование: /add <appid|ссылка|название> [--discount 20] [--note заметка] [--force]',
  addDlcUsage: 'Использование: /adddlc <appid базовой игры|ссылка|название> [--max 50]',
  discountInvalid: '--discount должен быть целым числом от 0 до 100.',
  addAdded: 'Мониторинг добавлен: {name} ({appid})',
  addAddedStatus:
    'Текущий статус: {status} · Базовый уровень записан; будущие изменения будут отправляться.',
  addAlready: 'Уже отслеживается: {line}',
  appNotAvailable:
    'Это приложение недоступно в регионе {region} (не найдено / снято с продажи / не продаётся в этом регионе).',
  addForceHint:
    'Чтобы всё равно добавить, укажите --force; тогда будут использоваться только новостные предупреждения.',
  selectionPrompt:
    'Несколько результатов соответствуют "{query}". Ответьте номером (действует 10 минут):',
  selectionInvalid:
    'Неверный номер. Ответьте от 1 до {count} или отправьте /cancel для отмены.',
  selectionViewerDenied:
    'Нет доступа: наблюдатели не могут добавлять мониторинги.',
  importDone: 'Импортировано DLC: {created}, пропущено: {skipped}, ошибок: {failed}.',
  importNoDlc: 'У приложения {appid} нет DLC для импорта.',

  quotaUser: 'Достигнут лимит мониторингов аккаунта ({limit}).',
  quotaSystem: 'Достигнут общий лимит мониторингов системы ({limit}).',
  importQuotaUser:
    'Недостаточно квоты мониторингов: занято {current}/{limit}; можно импортировать не более {maxImport} DLC.',
  importQuotaSystem: 'Недостаточно общей квоты мониторингов системы (лимит {limit}).',

  steamNetwork: 'Не удаётся подключиться к магазину Steam. Повторите попытку позже.',
  steamTimeout: 'Магазин Steam не ответил вовремя. Повторите попытку позже.',
  steamRateLimited: 'Запросы к Steam ограничены. Повторите попытку позже.',
  steamError: 'Запрос к Steam не удался ({code}).',
  onboardingRequired: 'Сначала завершите настройку региона и языка.',
  searchNotFound: 'Игра по запросу "{query}" не найдена.',
  unknownError: 'Неизвестная ошибка',

  checkDone: 'Проверка завершена; новых событий: {count}.',
  checkDoneCached: 'Проверка завершена (из кэша); новых событий: {count}.',
  checkNotFound:
    'Steam не вернул это приложение (возможно, оно снято с продажи или недоступно в этом регионе).',
  checkSkipped: 'Пропущено: мониторинг не существует или аккаунт отключён.',
  checkFailed: 'Проверка не удалась: {code}',

  listEmpty: 'Мониторингов пока нет. Используйте /add, чтобы добавить.',
  listNoMore: 'Больше мониторингов нет.',
  listHeader: 'Мониторинги (страница {page}, всего {total}):',

  usageTarget: 'Использование: /{command} <id|appid|название>',
  provideTarget: 'Укажите ID мониторинга, AppID или название.',
  notFoundRemove: 'Не найден мониторинг для удаления по запросу "{query}".',
  notFoundPause: 'Не найден мониторинг для приостановки по запросу "{query}".',
  notFoundResume: 'Не найден мониторинг для возобновления по запросу "{query}".',
  notFoundCheck: 'Не найден мониторинг для проверки по запросу "{query}".',
  notFoundPrice: 'Не найден мониторинг для запроса по "{query}".',
  manyMatches:
    '"{query}" соответствует нескольким мониторингам. Используйте ID или AppID:',
  removed: 'Мониторинг удалён: {line}',
  paused: 'Приостановлено: {line}',
  resumed: 'Возобновлено: {line}',

  eventsNotFound: 'Мониторинг "{item}" не найден.',
  eventsMany:
    'Запросу событий соответствует несколько мониторингов. Используйте ID или AppID.',
  eventsEmpty: 'Событий пока нет.',
  eventsHeader: 'Последние события:',

  ownerMissing: 'Аккаунт владельца бота не существует.',
  decryptFailed:
    'Не удаётся расшифровать учётные данные бота. Попросите администратора повторно ввести конфигурацию.',
  throttled:
    'Слишком много запросов. Повторите позже (не более 10 команд в минуту).',
  unauthorized:
    'Нет доступа. Попросите владельца бота добавить ваш ID платформы в список разрешённых.',
  authorizePrompt:
    'У вас ещё нет разрешения на использование "{bot}". Отправьте ссылку ниже владельцу бота; если вы владелец, войдите в веб-интерфейс и подтвердите (действует 30 минут):',
}
