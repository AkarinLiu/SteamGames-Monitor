import type { BotMessages } from './zh-CN'

export const koKP: BotMessages = {
  help: [
    'Steam 판매감시 명령',
    '/help — 도움말 보기',
    '/add <appid|링크|이름> [--discount 20] [--note 주석] [--force] — 감시항목 추가',
    '/adddlc <본체 appid|링크|이름> [--max 50] — 모든 DLC 가져오기',
    '/remove <id|appid|이름> — 감시항목 삭제',
    '/pause <id|appid|이름> — 검사 일시중지',
    '/resume <id|appid|이름> — 검사 재개',
    '/check <id|appid|이름> — 지금 검사',
    '/price <id|appid|이름> — 현재 가격 보기',
    '/list [--all] [--sale] [--paused] [--page 2] — 감시항목 목록 보기',
    '/events [--item id] [--limit 10] — 최근 사건 보기',
    '/cancel — 대기중인 선택 취소',
    '',
    '열람자는 /help /list /price /events를 사용할 수 있으며, 기타 명령은 관리자 권한이 필요합니다.',
  ].join('\n'),
  viewerDenied:
    '권한 없음: 열람자는 /help, /list, /price, /events만 사용할 수 있습니다.',
  cancelDone: '대기중인 선택을 취소했습니다.',
  unexpected: '예상하지 못한 결과입니다.',
  unknownCommandReply: '알수없는 명령입니다. /help를 보내 리용법을 확인하세요.',

  missingSlash: '명령은 /로 시작해야 합니다. /help를 보내 리용법을 확인하세요.',
  missingCommand: '명령 이름이 없습니다. /help를 보내 리용법을 확인하세요.',
  unknownCommandWithName:
    '알수없는 명령 /{command}입니다. /help를 보내 사용 가능한 명령을 확인하세요.',

  statusPaused: '일시중지됨',
  statusUnavailable: '리용 불가',
  statusDelistingSoon: '곧 판매 중지',
  statusComingSoon: '발매예정',
  statusUnknown: '검사대기',
  statusOnSale: '할인중',
  statusAvailable: '판매중',

  priceFree: '무료',
  priceWithDiscount: '{price}(-{discount}%)',
  priceNone: '가격 없음',

  monitorLine: '#{id} {name}({appid}) · {status} · {price}',
  appidOnly: 'AppID: {appid}',
  appidWithParent: 'AppID: {appid}(DLC, 본체 {parent})',
  detailStatus: '상태: {status}',
  detailPrice: '가격: {price}',
  detailInitialPrice: '원가: {price}',
  detailReleaseDate: '발매일: {date}',
  detailMinDiscount: '최소 할인: {discount}',
  followAccount: '계정 설정 따름',
  detailRegionLanguage: '지역 / 언어: {region} / {language}',
  detailLastCheck: '마지막 검사: {time}',
  neverChecked: '아직 검사하지 않음',
  detailFailures: '련속 실패: {count}',
  detailNotes: '주석: {notes}',
  detailStore: '상점: {url}',

  eventLine: '{time} · {type} · {name}{suffix}',
  eventDiscountSuffix: ' · -{discount}%',
  eventRelease: '게임 발매',
  eventSaleStart: '할인 시작',
  eventSaleChange: '할인 변경',
  eventSaleEnd: '할인 종료',
  eventPriceChange: '가격 변동',
  eventDelistingWarning: '판매중지 경고(발견법)',
  eventDelisted: '판매중지 / 구매불가',
  eventRestored: '판매 재개',
  eventCheckError: '검사 이상',

  addUsage: '리용법: /add <appid|링크|이름> [--discount 20] [--note 주석] [--force]',
  addDlcUsage: '리용법: /adddlc <본체 appid|링크|이름> [--max 50]',
  discountInvalid: '--discount는 0~100 사이의 정수여야 합니다.',
  addAdded: '감시항목 추가됨: {name}({appid})',
  addAddedStatus:
    '현재 상태: {status} · 기준선을 기록했습니다. 이후 변경 사항은 통지됩니다.',
  addAlready: '이미 감시중: {line}',
  appNotAvailable:
    '지역 {region}에서 이 앱을 가져올 수 없습니다(없음 / 판매중지 / 해당 지역 판매 불가).',
  addForceHint:
    '그래도 추가하려면 --force를 붙이세요. 이 경우 소식 경보만 수행됩니다.',
  selectionPrompt:
    '"{query}"에 여러 결과가 일치합니다. 번호를 답장하세요(10분 동안 유효):',
  selectionInvalid:
    '잘못된 번호입니다. 1-{count}로 답장하거나 /cancel을 보내 취소하세요.',
  selectionViewerDenied: '권한 없음: 열람자는 감시항목을 추가할 수 없습니다.',
  importDone: 'DLC {created}개를 가져왔고, {skipped}개를 건너뛰었으며, {failed}개가 실패했습니다.',
  importNoDlc: 'App {appid}에 가져올 DLC가 없습니다.',

  quotaUser: '계정 감시한도({limit})에 도달했습니다.',
  quotaSystem: '체계 감시한도({limit})에 도달했습니다.',
  importQuotaUser:
    '감시 배당량이 부족합니다: 현재 {current}/{limit}, 이번에 최대 {maxImport}개의 DLC를 가져올 수 있습니다.',
  importQuotaSystem: '체계 감시 배당량이 부족합니다(한도 {limit}).',

  steamNetwork: 'Steam 상점에 련결할 수 없습니다. 잠시 후 다시 시도하세요.',
  steamTimeout: 'Steam 상점 응답 시간이 초과되였습니다. 잠시 후 다시 시도하세요.',
  steamRateLimited: 'Steam 요청이 제한되였습니다. 잠시 후 다시 시도하세요.',
  steamError: 'Steam 요청 실패({code}).',
  onboardingRequired: '먼저 지역과 언어 설정을 완료하세요.',
  searchNotFound: '"{query}"와 일치하는 게임을 찾지 못했습니다.',
  unknownError: '알수없는 오류',

  checkDone: '검사 완료, 새 사건 {count}개.',
  checkDoneCached: '검사 완료(캐시 사용), 새 사건 {count}개.',
  checkNotFound:
    'Steam이 이 앱을 반환하지 않았습니다(판매중지 또는 현재 지역에서 리용 불가일 수 있음).',
  checkSkipped: '건너뜀: 감시항목이 없거나 계정이 비활성화되였습니다.',
  checkFailed: '검사 실패: {code}',

  listEmpty: '감시항목이 없습니다. /add로 추가하세요.',
  listNoMore: '더 이상 감시항목이 없습니다.',
  listHeader: '감시항목({page}페지, 총 {total}개):',

  usageTarget: '리용법: /{command} <id|appid|이름>',
  provideTarget: '감시항목 ID, AppID 또는 이름을 지정하세요.',
  notFoundRemove: '삭제할 감시항목 "{query}"을(를) 찾지 못했습니다.',
  notFoundPause: '일시중지할 감시항목 "{query}"을(를) 찾지 못했습니다.',
  notFoundResume: '재개할 감시항목 "{query}"을(를) 찾지 못했습니다.',
  notFoundCheck: '검사할 감시항목 "{query}"을(를) 찾지 못했습니다.',
  notFoundPrice: '조회할 감시항목 "{query}"을(를) 찾지 못했습니다.',
  manyMatches: '"{query}"에 여러 감시항목이 일치합니다. ID 또는 AppID를 사용하세요:',
  removed: '감시항목 삭제됨: {line}',
  paused: '일시중지됨: {line}',
  resumed: '재개됨: {line}',

  eventsNotFound: '감시항목 "{item}"을(를) 찾지 못했습니다.',
  eventsMany: '사건 조회에 여러 감시항목이 일치합니다. ID 또는 AppID를 사용하세요.',
  eventsEmpty: '아직 사건이 없습니다.',
  eventsHeader: '최근 사건:',

  ownerMissing: '봇 소유자 계정이 존재하지 않습니다.',
  decryptFailed:
    '봇 인증자료를 복호화할 수 없습니다. 관리자에게 설정을 다시 입력하도록 요청하세요.',
  throttled: '요청이 너무 많습니다. 잠시 후 다시 시도하세요(분당 최대 10개 명령).',
  unauthorized:
    '권한이 없습니다. 봇 소유자에게 플랫폼 ID를 허용 목록에 추가하도록 요청하세요.',
  authorizePrompt:
    '아직 "{bot}" 사용 권한이 없습니다. 아래 링크를 봇 소유자에게 보내세요. 소유자인 경우 브라우저에서 로그인하여 승인하세요(30분 동안 유효):',
}
