# 画面一覧（推しログ / OshiLog）

- フロントエンド: React 19 + React Router 7（`frontend/src/App.jsx` でルーティング定義）。
- **未ログイン時はURLに関わらずログイン画面（Login.jsx）を表示**（ルーター外）。以下の全ルートはログイン必須。
- `/admin` のみ追加で `user.is_admin` を判定し、非管理者は `/` へリダイレクト。未定義パス `*` も `/` へリダイレクト。
- 全ページは `Layout.jsx`（固定ヘッダー＋ボトムナビ＋AI相談FAB＋引っ張って更新）でラップされる。

## 一覧表

| # | URLパス | ファイルパス | 画面名 | 役割 |
|---|---|---|---|---|
| 0 | （ルーター外） | frontend/src/pages/Login.jsx | ログイン／新規登録 | 認証・アカウント作成・クイックログイン |
| 1 | / | frontend/src/pages/Home.jsx | ホーム | 「果実の木」ビジュアルで予定・支出・貯金等の要約を表示 |
| 2 | /oshi | frontend/src/pages/OshiBrowse.jsx | 推しをさがす・登録 | 推しマスターのジャンル別ブラウズ・検索・登録 |
| 3 | /oshi/:masterId | frontend/src/pages/OshiDetail.jsx | 推し詳細 | 登録人数・公式/グッズURL・着せ替え・推し別支出 |
| 4 | /calendar | frontend/src/pages/Calendar.jsx | カレンダー | 年→月→日の3階層カレンダー・予定CRUD・共有・リマインド |
| 5 | /records | frontend/src/pages/Records.jsx | 参戦記録・家計簿 | 支出の記録と月別・推し別の集計グラフ |
| 6 | /goods | frontend/src/pages/Goods.jsx | グッズコレクション | グッズの画像付き管理・カテゴリ絞り込み |
| 7 | /events | frontend/src/pages/Events.jsx | イベント | 共通イベントの一覧・参加・会場地図・重要度・貯金 |
| 8 | /history | frontend/src/pages/EventHistory.jsx | イベント履歴 | 参加済み過去イベントと記録・日記の振り返り |
| 9 | /friends | frontend/src/pages/Friends.jsx | 推し友 | 推し友一覧・検索・申請・トーク一覧の4タブ |
| 10 | /users/:id | frontend/src/pages/UserProfile.jsx | ユーザープロフィール | 他ユーザーの閲覧・申請・ブロック |
| 11 | /chat/:roomId | frontend/src/pages/Chat.jsx | トーク | DM・イベントグループのリアルタイムチャット |
| 12 | /album/:roomId | frontend/src/pages/AlbumView.jsx | 共有アルバム | トークルーム単位の写真アルバム |
| 13 | /posts | frontend/src/pages/Posts.jsx | つぶやき | 公開範囲付きミニSNSタイムライン |
| 14 | /diary | frontend/src/pages/Diary.jsx | 日記帳 | ページめくりUIの日記＋みんなの日記フィード |
| 15 | /mypage | frontend/src/pages/MyPage.jsx | マイページ | 個人向け機能への導線ハブ |
| 16 | /savings | frontend/src/pages/SavingsSupport.jsx | 貯金サポート | 貯金目標一覧＋貯金サポートAI相談 |
| 17 | /blocks | frontend/src/pages/Blocks.jsx | ブロックリスト | ブロック中ユーザーの確認・解除 |
| 18 | /notifications | frontend/src/pages/Notifications.jsx | 通知（通知センター） | 通知履歴・既読化 |
| 19 | /profile | frontend/src/pages/Profile.jsx | プロフィール設定 | プロフィール編集・公開設定・通知設定・テーマ・ログアウト |
| 20 | /admin | frontend/src/pages/Admin.jsx | 管理メニュー | イベント/会場/着せ替え審査/推しマスターの管理（管理者専用） |
| 21 | /guide | frontend/src/pages/ClientMenu.jsx | 推しログ ガイド | サイト案内AIチャット |

## 共通レイアウト（frontend/src/components/Layout.jsx）

- **固定ヘッダー**: タイトル「💗 推しログ」、🔔通知ベル（未読バッジ・`/notifications`へ）、ユーザー名＋アイコン（`/mypage`へ）。
  未読数は画面遷移ごとに `GET /api/notifications/unread-count` で再取得＋Socket `notification:new` で即時更新。
- **ボトムナビ（4タブ）**: 🏠ホーム(`/`)・📖予定(`/calendar`)・⭐推し(`/oshi`)・👥推し友(`/friends`)。
- **AI相談FAB**: 右下固定の丸ボタン →「推しログ ガイド」(`/guide`)。
- **PullToRefresh**: 最上部で引っ張るとページ再読み込み。

---

## 各画面の詳細

### 0. ログイン／新規登録（Login.jsx・ルーター外）
- ログイン／新規登録の2モード切替。新規登録はユーザーID＋表示名＋パスワード（4字以上）。
- クイックログイン: この端末でログインしたことのあるアカウント（localStorage `oshilog_accounts`・最大6件）をタップ選択→パスワードのみ入力。**パスワードは保存しない**。「×」で履歴削除。
- 呼び出しAPI: `POST /api/login`, `POST /api/register`。成功時はルーティングでなく App の状態切替で本体画面へ。

### 1. ホーム（Home.jsx）`/`
- 水彩風の木のSVGに8種の「果実」を配置：いちばん近い予定（カウントダウン）／今日・直近の予定／貯金（目標付きイベントがある時のみ）／グッズ／今月の推し活費／推している人／わたしの推し／家計簿。
- 果実タップでその場に拡大するモーダル（ページ遷移なし）。木タップで実が糸で吊るされる演出。端末時刻で昼／夜デザイン切替（6:00〜18:00が昼）。
- 今日の予定は全件、以降の直近予定は最大3件。重要度付き予定は色分け。金額・人数はカウントアップ演出。
- モーダル内からの遷移: カレンダー(`/calendar`)、イベントの貯金(`/events?focus=ID&savings=1`)、家計簿(`/records`)、推し(`/oshi`)、推し詳細(`/oshi/:masterId`)、グッズ(`/goods`)。
- API: `GET /api/schedules`, `GET /api/oshi`, `GET /api/stats/summary`, `GET /api/events`。

### 2. 推しをさがす・登録（OshiBrowse.jsx）`/oshi`
- ジャンル別ブロック（アイドル/声優/VTuber/アーティスト/スポーツ選手/その他）→タップでポラロイド風タイル展開。ジャンル内は登録人数の多い順。
- 名前の部分一致検索（ジャンル横断）。「わたしの推し」横スクロール一覧。ワンタップ登録／新規登録モーダル（名前・ジャンル・推しカラー8色・画像2MBまで）。
- 遷移: イベント一覧(`/events`)・イベント履歴(`/history`)・推し詳細(`/oshi/:id`)。
- API: `GET /api/oshi/browse`, `GET /api/oshi`, `POST /api/oshi`。Socket: 登録後 `resync` 送信。

### 3. 推し詳細（OshiDetail.jsx）`/oshi/:masterId`
- 表示画像（着せ替え反映）・ジャンル・登録人数・公式サイト/グッズURL（外部リンク・管理者のみ編集可）。
- 未登録なら「推しに登録する」。登録済みなら「この推しに使った金額」（累計・月別棒グラフ・記録一覧）。
- 着せ替え: 承認済みギャラリーから表示画像を選択（自分の画面のみ反映）／デフォルトに戻す。画像を管理者へ申請する導線あり。
- API: `GET /api/oshi/master/:id`, `POST /api/oshi`, `PUT /api/oshi/master/:id/display-image`, `POST /api/oshi/images`, `GET /api/oshi`, `GET /api/records`。

### 4. カレンダー（Calendar.jsx）`/calendar`
- 年（12か月ミニチュア）→月（13か月連続縦スクロール）→日（24時間タイムライン）の3階層。ズームイン/アウト遷移演出。
- 日付は「タップで選択→選択中を再タップで1日詳細」。1日詳細は15分=1行グリッドで、時刻付き予定は開始〜終了の帯表示・重なりは横並び。時間帯タップでその時刻入りの予定追加が開く。
- 予定検索（タイトル・メモ・推し名）。「予定のある月だけ」フィルタ。
- 予定モーダル: タイトル・種類6種・日付・開始/終了時刻（15分単位）・推し・メモ・関連URL・リマインド7択・共有先の推し友選択。
- 共有予定は「👤 ○○さんの共有予定」表示。自分の予定は削除可（confirm）。
- API: `GET /api/schedules`, `GET /api/oshi`, `GET /api/friends`, `POST/PUT/DELETE /api/schedules`。

### 5. 参戦記録・家計簿（Records.jsx）`/records`
- 「記録」タブ: 月送りで月別一覧＋月合計（判子風・カウントアップ）。登録モーダル（内容・日付・金額・推し・イベント紐付け・メモ）。登録時に判子が押される演出。削除可。
- 「集計」タブ: 推し別貢献度ドーナツグラフ＋月別支出棒グラフ（直近6ヶ月/全期間切替）。
- API: `GET /api/records?month=`, `GET /api/stats/summary`, `GET /api/oshi`, `GET /api/events`, `POST /api/records`, `DELETE /api/records/:id`。

### 6. グッズコレクション（Goods.jsx）`/goods`
- ポラロイド風2列グリッド。カテゴリチップで絞り込み（8カテゴリ）。追加モーダル（名前・カテゴリ・価格・推し・画像2MB・メモ）。削除可。
- API: `GET /api/goods`, `GET /api/oshi`, `POST /api/goods`, `DELETE /api/goods/:id`。

### 7. イベント（Events.jsx）`/events`
- 共通イベント一覧（画像・重要度・残り日数・参加者数）。`?focus=ID` で該当カードへスクロール＋ハイライト、`&savings=1` で入出金モーダル自動オープン。
- 参加/参加取消（参加でカレンダー追加＋グループトーク自動参加。取消はconfirm）。参加後にトークへ自動遷移。
- 会場アクセス: 埋め込み地図（Google Maps・キー未設定時は外部リンク）、最寄り駅ルート（所要時間・距離）、運賃メモ。
- 重要度3段階セレクタ。貯金: 目標設定・入出金モーダル（残高・達成率・履歴）・貯金サポートAI相談（残り回数表示）。
- API: `GET /api/events`, `POST /api/events/:id/join|leave`, `PUT /api/events/:id/importance|savings`, `GET/POST /api/events/:id/savings(...)`, `POST /api/events/:id/savings/ai`, `GET /api/maps/config`, `GET /api/events/:id/route`。Socket: 参加/取消後 `resync`。

### 8. イベント履歴（EventHistory.jsx）`/history`
- 参加済みの過去イベント一覧（重要度色分け・支出額・記録数・日記数）。カードタップで参戦記録＋日記の詳細モーダル。
- API: `GET /api/events/history`, `GET /api/events/:id/mylog`。

### 9. 推し友（Friends.jsx）`/friends`
- 4タブ: **推し友**（一覧・トークへ・解除）／**さがす**（ID検索＋同じ推しのおすすめ・申請）／**申請**（承認・拒否、件数バッジ）／**トーク**（ルーム一覧・未読バッジ・ピン止め）。
- Socket受信で申請・承認をリアルタイム反映。承認後 `resync` 送信。
- API: `GET /api/friends(/requests|/recommendations)`, `GET /api/users/search`, `POST /api/friends/request`, `POST /api/friends/:id/accept|reject`, `DELETE /api/friends/:id`, `GET /api/chat/rooms`, `POST/DELETE /api/chat/rooms/:id/pin`。

### 10. ユーザープロフィール（UserProfile.jsx）`/users/:id`
- 他ユーザーの閲覧。非公開×非推し友は詳細非表示（サーバー判定）。自分を開いたら `/profile` へ自動リダイレクト。
- 推し友申請／届いている申請の承認／申請済み表示。推し友なら「トークする」。ブロック／解除（相手に気付かれない設計）。
- API: `GET /api/users/:id/profile`, `POST /api/friends/request`, `POST /api/friends/:id/accept`, `POST /api/users/:id/block|unblock`。

### 11. トーク（Chat.jsx）`/chat/:roomId`
- DM・イベントグループ共通のリアルタイムチャット。テキスト（1000字・改行可）＋添付（画像/動画/ファイル・5MB・送信前確認モーダル）。
- 既読表示（DM=「既読」、グループ=「既読n」）。画像・動画は「📸保存」で共有アルバムへ。イベントチャットは参加者一覧モーダル。
- 遷移: アルバム(`/album/:roomId`)、送信者アイコン→プロフィール(`/users/:id`)。
- API: `GET /api/chat/rooms`, `GET /api/chat/rooms/:id/messages|members`, `POST /api/chat/rooms/:id/album`。Socket: `chat:send`/`chat:read` 送信、`chat:message`/`chat:read` 受信。

### 12. 共有アルバム（AlbumView.jsx）`/album/:roomId`
- ルームメンバーの写真アルバム（3列グリッド・全画面ビューア）。追加（3MBまで）・自分の写真のみ削除。`album:new` でリアルタイム追加。
- API: `GET/POST /api/chat/rooms/:id/album`, `DELETE /api/chat/rooms/:id/album/:photoId`。

### 13. つぶやき（Posts.jsx）`/posts`
- 投稿フォーム（300字・公開範囲: 全体/同じ推しの2種・「同じ推し」は推し選択必須）＋タイムライン。自分の投稿のみ削除可。
- `post:new` で新着をリアルタイム受信。投稿者アイコン→プロフィールへ。
- API: `GET/POST /api/posts`, `DELETE /api/posts/:id`, `GET /api/oshi`。

### 14. 日記帳（Diary.jsx）`/diary`
- 「わたしの手帳」: ページめくりUI（1ページ=1日記・前後移動）。編集・削除。
- 「みんなの日記」: 公開日記フィード（公開範囲はサーバー判定）。
- 作成モーダル: 日付・タイトル・本文・推し・思い出のイベント・公開範囲4種（プライベート/全体/同じ推し/同じイベント参加者）。
- API: `GET /api/diary`, `GET /api/diary/feed`, `POST/PUT/DELETE /api/diary`, `GET /api/oshi`, `GET /api/events`。

### 15. マイページ（MyPage.jsx）`/mypage`
- ヘッダーのユーザーアイコンから開く導線ハブ。プロフィール要約カード＋リンク一覧:
  プロフィール設定・つぶやき・日記帳・貯金目標一覧&AI相談・グッズ・参戦記録/家計簿・イベント履歴・アカウント公開設定・ブロックリスト・サイト案内AI・（管理者のみ）管理者画面。
- API呼び出しなし。

### 16. 貯金サポート（SavingsSupport.jsx）`/savings`
- 参加中イベントを選んで貯金サポートAIに相談（残り回数表示）。貯金目標一覧（達成率バー）。イベントページへの導線。
- API: `GET /api/events`, `GET /api/ai/status`, `POST /api/events/:id/savings/ai`。

### 17. ブロックリスト（Blocks.jsx）`/blocks`
- ブロック中ユーザーの一覧と解除（confirm）。行タップでプロフィールへ。
- API: `GET /api/blocks`, `POST /api/users/:id/unblock`。

### 18. 通知（Notifications.jsx）`/notifications`
- 通知履歴一覧（未読は太字＋縁取り＋ドット）。タップで既読化→`link_url` の画面へ。「すべて既読にする」でヘッダーバッジも即時更新。
- API: `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`。

### 19. プロフィール設定（Profile.jsx）`/profile`
- 表示名・自己紹介・個人アイコンの編集。アカウント公開/非公開、推し友申請の自動拒否、通知カテゴリ4種のトグル。
- 登録している推し一覧（→推し詳細）。Web Push通知のオン/再設定（iOSは「ホーム画面に追加」案内）。テーマカラー5色選択。ログアウト。
- API: `GET /api/me`, `PUT /api/me`, `GET /api/oshi`、Push有効化時 `GET /api/push/vapid`, `POST /api/push/subscribe`。

### 20. 管理メニュー（Admin.jsx）`/admin`（管理者専用）
- 4タブ: **イベント**（CRUD・参加者数・削除警告）／**会場**（CRUD・緯度経度・最寄り駅・運賃メモ）／**審査**（着せ替え画像の承認・却下、待ち件数バッジ）／**推し**（マスターの追加・名前/ジャンル/URL/代表画像の編集）。
- API: `GET /api/admin/events|venues|oshi-images|oshi-master`, `POST/PUT/DELETE /api/events`, `POST/PUT/DELETE /api/admin/venues`, `POST /api/admin/oshi-images/:id/approve|reject`, `POST/PUT /api/admin/oshi-master`, `GET /api/oshi/browse`。

### 21. 推しログ ガイド（ClientMenu.jsx）`/guide`
- サイト案内AIとのチャット（回数制限なし）。質問例チップ5種。会話履歴全体を送って回答を得る。
- API: `POST /api/assistant/site`。

---

## フロントエンド共通基盤

- **api.js**: `fetch('/api'+path)`。localStorage `oshilog_auth` の `{token, user}` を保持し `Authorization: Bearer` を付与。401で自動ログアウト。アカウント履歴 `oshilog_accounts`（パスワード非保存）。
- **socket.js**: 同一オリジンへ `io({ auth: { token } })`。ログインで接続・ログアウトで切断。
- **pwa.js / sw.js**: SW登録・`enablePush()`（許可→VAPID鍵取得→購読→サーバー登録）・`resyncPush()`（起動時の購読自動修復）。SWは**オフラインキャッシュなし**（Push受信とホーム画面追加が目的）。アプリ表示中はOS通知の代わりにアプリ内トースト（iOSは常にOS通知）。
- **theme.js**: テーマ5色（ワイン/スモークブルー/セージグリーン/モーヴ/テラコッタ）。Tailwind v4 の `@theme` 変数を実行時上書き＋`meta[theme-color]` 更新。localStorage `oshilog_theme`。
- **ui.jsx**: Avatar / UserChip（タップで `/users/:id` へ遷移する共通部品）/ OshiAvatar / Card / Modal / Field / OshiSelect / PrimaryButton / GhostButton / Empty / Loading / SectionTitle / Toggle / ProgressBar / CountUp。
- **Toast.jsx**: SWからのpostMessageを受けるアプリ内通知トースト（5秒自動消滅・タップで遷移）。
- **PullToRefresh.jsx**: 引っ張って更新（しきい値超えでリロード）。
