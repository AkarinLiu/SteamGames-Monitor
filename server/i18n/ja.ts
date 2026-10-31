import type { BotMessages } from './zh-CN'

export const ja: BotMessages = {
  help: [
    'Steam 販売監視コマンド',
    '/help — ヘルプを表示',
    '/add <appid|リンク|名前> [--discount 20] [--note メモ] [--force] — 監視を追加',
    '/adddlc <本体 appid|リンク|名前> [--max 50] — すべての DLC をインポート',
    '/remove <id|appid|名前> — 監視を削除',
    '/pause <id|appid|名前> — チェックを一時停止',
    '/resume <id|appid|名前> — チェックを再開',
    '/check <id|appid|名前> — 今すぐチェック',
    '/price <id|appid|名前> — 現在の価格を表示',
    '/list [--all] [--sale] [--paused] [--page 2] — 監視一覧を表示',
    '/events [--item id] [--limit 10] — 最近のイベントを表示',
    '/cancel — 選択待ちをキャンセル',
    '',
    '閲覧者は /help /list /price /events を使用できます。その他のコマンドには管理者権限が必要です。',
  ].join('\n'),
  viewerDenied:
    '権限がありません: 閲覧者は /help、/list、/price、/events のみ使用できます。',
  cancelDone: '選択待ちをキャンセルしました。',
  unexpected: '予期しない結果です。',
  unknownCommandReply: '不明なコマンドです。/help を送信して使い方を確認してください。',

  missingSlash: 'コマンドは / で始める必要があります。/help を送信して使い方を確認してください。',
  missingCommand: 'コマンド名がありません。/help を送信して使い方を確認してください。',
  unknownCommandWithName:
    '不明なコマンド /{command} です。/help を送信して利用可能なコマンドを確認してください。',

  statusPaused: '一時停止中',
  statusUnavailable: '利用不可',
  statusDelistingSoon: '近日販売終了',
  statusComingSoon: '発売予定',
  statusUnknown: 'チェック待ち',
  statusOnSale: 'セール中',
  statusAvailable: '販売中',

  priceFree: '無料',
  priceWithDiscount: '{price}（-{discount}%）',
  priceNone: '価格なし',

  monitorLine: '#{id} {name}（{appid}）· {status} · {price}',
  appidOnly: 'AppID：{appid}',
  appidWithParent: 'AppID：{appid}（DLC、本体 {parent}）',
  detailStatus: '状態：{status}',
  detailPrice: '価格：{price}',
  detailInitialPrice: '通常価格：{price}',
  detailReleaseDate: '発売日：{date}',
  detailMinDiscount: '最低割引：{discount}',
  followAccount: 'アカウント設定に従う',
  detailRegionLanguage: '地域 / 言語：{region} / {language}',
  detailLastCheck: '前回のチェック：{time}',
  neverChecked: '未チェック',
  detailFailures: '連続失敗：{count}',
  detailNotes: 'メモ：{notes}',
  detailStore: 'ストア：{url}',

  eventLine: '{time} · {type} · {name}{suffix}',
  eventDiscountSuffix: ' · -{discount}%',
  eventRelease: 'ゲーム発売',
  eventSaleStart: 'セール開始',
  eventSaleChange: 'セールの変化',
  eventSaleEnd: 'セール終了',
  eventPriceChange: '価格変動',
  eventDelistingWarning: '販売終了の警告（ヒューリスティック）',
  eventDelisted: '販売終了 / 購入不可',
  eventRestored: '販売再開',
  eventCheckError: 'チェック異常',

  addUsage:
    '使い方：/add <appid|リンク|名前> [--discount 20] [--note メモ] [--force]',
  addDlcUsage: '使い方：/adddlc <本体 appid|リンク|名前> [--max 50]',
  discountInvalid: '--discount は 0〜100 の整数で指定してください。',
  addAdded: '監視を追加しました：{name}（{appid}）',
  addAddedStatus:
    '現在の状態：{status} · ベースラインを記録しました。以降の変更は通知されます。',
  addAlready: 'すでに監視中です：{line}',
  appNotAvailable:
    '地域 {region} ではこのアプリを取得できません（存在しない / 販売終了 / この地域では販売されていません）。',
  addForceHint:
    'それでも追加する場合は --force を付けてください。ニュース警告のみ行われます。',
  selectionPrompt:
    '「{query}」に複数の結果が一致しました。番号を返信してください（10 分間有効）：',
  selectionInvalid:
    '番号が無効です。1〜{count} で返信するか、/cancel を送信してキャンセルしてください。',
  selectionViewerDenied: '権限がありません: 閲覧者は監視を追加できません。',
  importDone: 'DLC を {created} 件インポートし、{skipped} 件をスキップ、{failed} 件失敗しました。',
  importNoDlc: 'App {appid} にはインポートできる DLC がありません。',

  quotaUser: 'アカウントの監視上限（{limit}）に達しました。',
  quotaSystem: 'システムの監視上限（{limit}）に達しました。',
  importQuotaUser:
    '監視枠が不足しています：現在 {current}/{limit}、今回インポートできる DLC は最大 {maxImport} 件です。',
  importQuotaSystem: 'システムの監視枠が不足しています（上限 {limit}）。',

  steamNetwork: 'Steam ストアに接続できません。しばらくしてから再試行してください。',
  steamTimeout: 'Steam ストアの応答がタイムアウトしました。しばらくしてから再試行してください。',
  steamRateLimited: 'Steam リクエストが制限されています。しばらくしてから再試行してください。',
  steamError: 'Steam リクエストに失敗しました（{code}）。',
  onboardingRequired: '先に地域と言語の設定を完了してください。',
  searchNotFound: '「{query}」に一致するゲームが見つかりません。',
  unknownError: '不明なエラー',

  checkDone: 'チェック完了。新しいイベント {count} 件。',
  checkDoneCached: 'チェック完了（キャッシュ使用）。新しいイベント {count} 件。',
  checkNotFound:
    'Steam がこのアプリを返しませんでした（販売終了、またはこの地域で利用不可の可能性があります）。',
  checkSkipped: 'スキップしました：監視が存在しないか、アカウントが無効です。',
  checkFailed: 'チェック失敗：{code}',

  listEmpty: '監視はまだありません。/add で追加してください。',
  listNoMore: 'これ以上の監視はありません。',
  listHeader: '監視一覧（{page} ページ、全 {total} 件）：',

  usageTarget: '使い方：/{command} <id|appid|名前>',
  provideTarget: '監視 ID、AppID、または名前を指定してください。',
  notFoundRemove: '削除する監視「{query}」が見つかりません。',
  notFoundPause: '一時停止する監視「{query}」が見つかりません。',
  notFoundResume: '再開する監視「{query}」が見つかりません。',
  notFoundCheck: 'チェックする監視「{query}」が見つかりません。',
  notFoundPrice: '照会する監視「{query}」が見つかりません。',
  manyMatches: '「{query}」に複数の監視が一致しました。ID または AppID を使用してください：',
  removed: '監視を削除しました：{line}',
  paused: '一時停止しました：{line}',
  resumed: '再開しました：{line}',

  eventsNotFound: '監視「{item}」が見つかりません。',
  eventsMany: 'イベント検索に複数の監視が一致しました。ID または AppID を使用してください。',
  eventsEmpty: 'イベントはまだありません。',
  eventsHeader: '最近のイベント：',

  appName: 'Steam 監視',
  notificationTitle: '【{label}】{name}',
  notificationFooter: '{app} · {time}',
  notificationViewOnSteam: 'Steam で見る',
  notificationEntry: '項目：{name}（appid {appid}）',
  notificationRegion: '地域：{region}',
  notificationReleased: '「{name}」が正式に発売されました。',
  notificationReleaseDate: '発売日：{date}',
  notificationCurrentPrice: '現在の価格：{price}',
  notificationThresholdReached: '監視しきい値 {threshold}% に達しました',
  notificationDiscountChange: '割引の変化：{old}% → {new}%',
  notificationPriceChange: '価格の変化：{old} → {new}',
  notificationSaleEnded: 'セール終了、通常価格に戻りました。',
  notificationSaleEndedWithPrice: 'セール終了、通常価格 {price} に戻りました。',
  notificationPreviousDiscount: '以前の割引：{discount}%',
  notificationBecameFree: 'この商品は無料になりました。',
  notificationBecamePaid: 'この商品は無料から有料になりました。',
  notificationBecamePaidWithPrice: 'この商品は無料から有料になりました：{price}。',
  notificationBasePriceChange: '通常価格の変化：{old} → {new}',
  notificationSteamNews: 'Steam ニュース：「{title}」',
  notificationMatchedKeyword: '一致したキーワード：{keyword}',
  notificationDelistingHint:
    'これはニュースのキーワードに基づくヒューリスティックな警告です。販売終了予定かどうかを手動で確認してください。',
  notificationNewsLink: 'ニュースリンク：{url}',
  notificationDelistedConfirmed:
    '2 回連続のチェックで、この商品がストアで購入できないことを確認しました。',
  notificationRestoredFirst: 'この商品は地域 {region} で購入できるようになりました。',
  notificationRestored: 'この商品は再び購入可能になりました（地域 {region}）。',
  notificationCheckFailed: '{count} 回連続でチェックに失敗しました（{code}）。',
  notificationAutoPaused:
    'この監視は自動的に一時停止されました。確認後に手動で再開してください。',
  notificationSteamNewsFallback: 'Steam ニュース',
  notificationTestTitle: '【テスト通知】Steam 監視',
  notificationTestChannelOk: '通知チャネル「{channel}」の設定に成功しました。',
  notificationTestHint:
    'このメッセージを受信できていれば、このチャネルは監視通知を受信できます。',

  ownerMissing: 'ボットの所有者アカウントが存在しません。',
  decryptFailed:
    'ボットの認証情報を復号できません。管理者に設定の再入力を依頼してください。',
  throttled: 'リクエストが多すぎます。しばらくしてから再試行してください（1 分あたり最大 10 コマンド）。',
  unauthorized:
    '権限がありません。ボット所有者にプラットフォーム ID を許可リストへ追加してもらってください。',
  authorizePrompt:
    '「{bot}」を使用する権限がまだありません。以下のリンクをボット所有者に送信してください。所有者の場合はブラウザでサインインして承認してください（30 分間有効）：',
}
