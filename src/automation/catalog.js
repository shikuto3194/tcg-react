const text = { type: 'string' }, integer = { type: 'integer', minimum: 0 }, object = { type: 'object' };
const choice = (...values) => ({ type: 'string', enum: values });
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const cardId = { type: 'integer', minimum: 1 };
const values = { anyOf: [text, { type: 'number' }, { type: 'null' }] };
const cardPatch = { type: 'object', properties: Object.fromEntries(['name', 'cardNumber', 'effect', 'limit', 'ownedCount', 'color', 'type', 'rarity', 'tribe', 'cost', 'reduction', 'symbol'].map(key => [key, values])), patternProperties: { '^item[1-9][0-9]*$': values }, additionalProperties: false };
const definitions = [
  ['status', '接続状態、対象ゲーム、保存版番号、操作上の制限を取得。更新前に必ず呼ぶ。', {}, [], false],
  ['games_list', '登録ゲームの一覧。', {}, [], false],
  ['game_create', '空のゲームを追加して切り替える。', { name: text }, ['name'], true],
  ['game_select', '指定ゲームへ切り替える。', {}, [], true],
  ['settings_get', '項目の安定キー、表示名、セット設定、寸法、サイド設定。', {}, [], false],
  ['settings_update', 'ゲーム設定を更新。使用中の項目・サイドは削除不可。', { settings: object, name: text }, ['settings'], true],
  ['cards_search', 'カードを検索。fieldsはtcg_settings_getのfieldKeysをキー、labelsを表示名として対応させる（例: color=色）。表示順からitem1等を推測しない。追加項目も設定済みキーで検索可能。不明なキーはエラー。値は完全一致。画像はcards_getで取得。', { query: text, fields: { type: 'object', additionalProperties: text }, pack: text, ownership: choice('', 'owned', 'zero', 'unknown', 'shortage'), offset: integer, limit: { type: 'integer', minimum: 1, maximum: 200 } }, [], false],
  ['cards_get', 'カード詳細。画像を含める場合はincludeImages=true。', { cardId, includeImages: { type: 'boolean' } }, ['cardId'], false],
  ['cards_add', '画像なしカードを追加。名前必須。', { card: cardPatch }, ['card'], true],
  ['cards_update', 'カード情報を部分更新。両面はfaceで表裏を指定。', { cardId, face: choice('front', 'back'), patch: cardPatch }, ['cardId', 'patch'], true],
  ['cards_import', '画像とCSV／JSONを一括取込。pathは相対名、imageは画像data URL。', { images: { type: 'array', items: schema({ path: text, image: text }, ['path', 'image']) }, files: { type: 'array', items: schema({ name: text, text }, ['name', 'text']) } }, [], true],
  ['draft_get', '作成中のメイン・サイド・名前・サムネイルを取得。', {}, [], false],
  ['draft_set_count', '作成中デッキの枚数を指定。0で外す。上限はゾーンごと。', { cardId, zoneId: text, count: integer }, ['cardId', 'zoneId', 'count'], true],
  ['draft_configure', '作成中デッキの名前またはサムネイルを変更。', { name: text, thumbnailCardId: { anyOf: [cardId, { type: 'null' }] } }, [], true],
  ['draft_clear', '作成中デッキを空にする。', {}, [], true],
  ['draft_load', '保存デッキを作成中デッキへ読み込む。', { deckId: text }, ['deckId'], true],
  ['draft_save', '作成中デッキを保存。同名上書きはoverwrite=trueを明示。', { overwrite: { type: 'boolean' } }, [], true],
  ['decks_search', '保存デッキの検索・条件・並べ替え。', { query: text, filters: object, sort: choice('hit', 'name', 'createdAt', 'updatedAt', 'pack'), direction: choice('asc', 'desc') }, [], false],
  ['decks_get', '保存デッキの構築を取得。', { deckId: text }, ['deckId'], false],
  ['decks_delete', '保存デッキを削除。confirm=trueを明示。', { deckId: text, confirm: { const: true } }, ['deckId', 'confirm'], true],
  ['decks_import', 'デッキJSONを読込。カード・設定が一致しなければ拒否。', { deck: object, overwrite: { type: 'boolean' } }, ['deck'], true],
  ['ownership_get', '所持枚数・セット集計・保存デッキ使用内訳・不足を取得。', {}, [], false],
  ['ownership_set', '複数カードの所持枚数を一括確定。nullは未入力、0は0枚。', { counts: { type: 'array', items: schema({ cardId, count: { anyOf: [integer, { type: 'null' }] } }, ['cardId', 'count']) } }, ['counts'], true],
  ['events_list', 'イベントの登録デッキ、各マッチとゲーム内訳・当時の構築を取得。', {}, [], false],
  ['events_put', 'イベント全体を作成・修正。修正前にevents_listを取得。formatはBO形式、deckCountは使用デッキ数の文字列。decks:[{id?,deckId}]で登録。matches:[{id?,result,deckId?,games:[{id?,registeredDeckId?,deckId?,opponent,result,turn,memo}]}]で各ゲームを記録。resultはwin/loss/draw/空欄、turnはfirst/second/空欄。マッチ結果はゲーム結果と別に指定。ID省略は新規。構築の書式はevents_listを参照。', { event: object }, ['event'], true],
  ['events_delete', 'イベントを削除。confirm=trueを明示。', { eventId: text, confirm: { const: true } }, ['eventId', 'confirm'], true],
  ['statistics_get', 'unit=match（既定）/gameでマッチ/ゲーム別の勝敗・勝率・日別結果を取得。filtersはfrom,to,eventId,format,deckCount,deck,opponent,result,turn。複数デッキのマッチは組み合わせ別、gameは個別デッキ別に集計。ゲーム内訳未入力はgameに含めない。引き分けは勝率の分母に含めない。', { unit: choice('match', 'game'), filters: object, group: choice('event', 'deck', 'turn', 'opponent') }, [], false],
  ['deck_export', 'デッキをJSON／SVG／PNG／PDFへ出力。複数ページは複数ファイル。', { deckId: text, format: choice('json', 'svg', 'png', 'pdf') }, ['deckId', 'format'], false],
  ['backup_export', '全ゲームを画像込みで出力。接続用の秘密情報は含まない。', {}, [], false],
  ['backup_restore', '画像込みバックアップを別ゲームとして追加。元のデータは維持。', { backup: object }, ['backup'], true],
  ['ui_get', '現在のタブ・検索条件・詳細・所持編集状態を取得。', {}, [], false],
  ['ui_inspect', '画面の操作可能なボタン・入力欄と現在値を取得。接続キーは返さない。', {}, [], false],
  ['ui_act', 'ui_inspectのscreenIdとcontrolを使い、画面と同じ操作を実行。fillは値の入力、clickはボタンやチェック操作。確認が必要なら一度止まり、confirm=trueを明示して再操作する。結果は操作発行で、出力ファイルの保存完了を意味しない。', { screenId: text, control: integer, action: choice('click', 'fill'), value: text, confirm: { type: 'boolean' } }, ['screenId', 'control', 'action'], false],
  ['ui_set', 'タブ、表示形式、カード検索、詳細を操作。所持編集の完了・取消は画面側で行う。', { tab: choice('home', 'search', 'deck', 'saved', 'analysis'), viewMode: choice('list', 'grid'), search: text, cardId, deckId: text, closeDetails: { type: 'boolean' } }, [], false],
];
export const operations = definitions.map(([key, description, properties, required, writes]) => ({
  key, writes, name: `tcg_${key}`, description,
  inputSchema: schema({ gameId: text, ...properties, ...(writes ? { requestId: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]{15,127}$' }, expectedRevision: text } : {}) }, [...required, ...(key === 'status' || key === 'games_list' || key === 'game_create' ? [] : ['gameId']), ...(writes ? ['requestId', 'expectedRevision'] : [])]),
  annotations: { readOnlyHint: !writes && !['ui_set', 'ui_act'].includes(key), destructiveHint: ['decks_delete', 'events_delete', 'draft_clear', 'settings_update', 'ui_act'].includes(key), openWorldHint: false },
}));
