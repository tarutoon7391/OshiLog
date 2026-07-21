# APIエンドポイント一覧（推しログ / OshiLog）

- 実装場所: `backend/server.js`（Express）。ベースパスは `/api`。
- 認証方式: `Authorization: Bearer <トークン>` ヘッダ。トークンは `userId.HMAC-SHA256署名` 形式（`backend/auth.js`）。
- 認証欄の意味:
  - **不要** … 未ログインで呼べる
  - **要ログイン** … `auth` ミドルウェア（トークン必須）
  - **管理者** … `auth`＋`admin` ミドルウェア（users.is_admin をDBで確認。一般ユーザーは403）
- 所有・権限チェック（本人の予定のみ更新可、ルームメンバーのみ閲覧可など）はすべてサーバー側のSQL条件で実施。
- エラー時は `{ error: 'メッセージ' }` のJSONを返す。未定義の `/api/*` は404 JSON。
- `/api` 以外のGETは `frontend/dist/index.html` を返す（SPA配信・静的配信もExpressが担当）。

## 基盤・認証

| メソッド | パス | 役割 | 認証 |
|---|---|---|---|
| GET | /api/health | ヘルスチェック（Railwayのhealthcheckにも使用） | 不要 |
| GET | /api/maps/config | Google Maps APIキーの実行時受け渡し（`{enabled, apiKey}`。未設定なら enabled:false） | 要ログイン |
| POST | /api/register | 新規登録。username（1〜20字・重複409）、password（4字以上）、display_name任意。成功で `{user, token}` | 不要 |
| POST | /api/login | ログイン。成功で `{user, token}` | 不要 |
| GET | /api/me | 自分のユーザー情報＋設定（通知カテゴリ等）を取得 | 要ログイン |
| PUT | /api/me | プロフィール（表示名20字/アイコン/自己紹介200字）・公開設定・申請自動拒否・通知カテゴリ4種を更新 | 要ログイン |

## 推し（個人登録・マスター・着せ替え）

| メソッド | パス | 役割 | 認証 |
|---|---|---|---|
| GET | /api/oshi/browse | 全推しマスター一覧（登録人数・自分の登録有無・閲覧者ごとの表示画像付き。人気順） | 要ログイン |
| GET | /api/oshi | 自分が登録している推し一覧（着せ替え画像を優先した表示画像付き） | 要ログイン |
| POST | /api/oshi | 推し登録。同名マスターがあれば紐付け、なければ新規作成（最初の登録者の画像を代表画像に）。二重登録は409 | 要ログイン |
| PUT | /api/oshi/:id | 自分の推しの色・画像を変更 | 要ログイン（本人の行のみ） |
| DELETE | /api/oshi/:id | 推し登録の解除 | 要ログイン（本人の行のみ） |
| GET | /api/oshi/master/:id | 推し詳細（登録人数・公式/グッズURL・承認済みギャラリー・自分の着せ替え選択状態） | 要ログイン |
| GET | /api/oshi/master/:id/gallery | その推しの承認済み着せ替え画像一覧 | 要ログイン |
| PUT | /api/oshi/master/:id/display-image | 着せ替え選択（承認済み画像のみサーバー検証。nullでデフォルトに戻す。本人の画面のみ反映） | 要ログイン |
| POST | /api/oshi/images | 着せ替え画像を管理者へ申請（status=pendingで登録） | 要ログイン |

## 予定（スケジュール）

| メソッド | パス | 役割 | 認証 |
|---|---|---|---|
| GET | /api/schedules | 自分の予定＋自分に共有された推し友の予定を返す（is_own・共有先ID配列・イベント重要度付き） | 要ログイン |
| POST | /api/schedules | 予定作成。共有先（承認済み推し友のみ有効）・関連URL（http/httpsのみ）・リマインド（5/15/30/60/180/1440分前）対応 | 要ログイン |
| PUT | /api/schedules/:id | 予定更新。日時・リマインドタイミング変更時のみ送信済み印をリセット | 要ログイン（本人のみ） |
| DELETE | /api/schedules/:id | 予定削除 | 要ログイン（本人のみ） |

## 参戦記録・家計簿・集計

| メソッド | パス | 役割 | 認証 |
|---|---|---|---|
| GET | /api/records | 自分の参戦記録一覧（`?month=YYYY-MM` で月絞り込み。推し名・イベント名付き） | 要ログイン |
| POST | /api/records | 参戦記録の作成（推し・イベント紐付け任意） | 要ログイン |
| PUT | /api/records/:id | 参戦記録の更新 | 要ログイン（本人のみ） |
| DELETE | /api/records/:id | 参戦記録の削除 | 要ログイン（本人のみ） |
| GET | /api/stats/summary | 集計：推し別支出合計（byOshi）・直近6か月の月別支出（monthly）・全期間の月別支出（monthlyAll） | 要ログイン |

## グッズ

| メソッド | パス | 役割 | 認証 |
|---|---|---|---|
| GET | /api/goods | 自分のグッズ一覧 | 要ログイン |
| POST | /api/goods | グッズ登録（名前必須・カテゴリ・価格・画像・メモ） | 要ログイン |
| DELETE | /api/goods/:id | グッズ削除 | 要ログイン（本人のみ） |

## つぶやき（タイムライン）

| メソッド | パス | 役割 | 認証 |
|---|---|---|---|
| GET | /api/posts | タイムライン取得（最新100件）。公開範囲（本人/全体/同じ推し）とブロック関係をサーバー側で判定して絞り込み | 要ログイン |
| POST | /api/posts | つぶやき投稿（300字まで。公開範囲は public_all / public_same_oshi の2種のみ）。公開範囲に応じたSocketルームへリアルタイム配信 | 要ログイン |
| DELETE | /api/posts/:id | つぶやき削除。投稿者本人のみ（他人は403） | 要ログイン（本人のみ） |

## 推し友・ユーザー・ブロック

| メソッド | パス | 役割 | 認証 |
|---|---|---|---|
| GET | /api/friends | 推し友一覧（DMルームID付き） | 要ログイン |
| GET | /api/friends/requests | 自分宛ての未承認申請一覧 | 要ログイン |
| GET | /api/friends/recommendations | 同じ推しを登録している公開ユーザーをランダムおすすめ（最大10件。友達/申請中/ブロック関係は除外） | 要ログイン |
| POST | /api/friends/request | 推し友申請。自分が相手をブロック中は403、相手にブロックされている・相手が自動拒否設定の場合は「成功したふり」（気付かせない） | 要ログイン |
| POST | /api/friends/:id/accept | 申請の承認（受け手のみ）。DMルームを自動作成（過去のルームがあれば再利用）＋通知 | 要ログイン |
| POST | /api/friends/:id/reject | 申請の拒否（行を削除＝再申請可能） | 要ログイン |
| DELETE | /api/friends/:id | 推し友の解除（アンフレンド）。どちらからでも可。トーク履歴は残る | 要ログイン |
| GET | /api/users/search | ログインID部分一致検索（`?username=`・最大10件）。ブロック関係は除外。関係状態（推し友/申請中）も返す | 要ログイン |
| GET | /api/users/:id/profile | 他ユーザーのプロフィール。非公開ユーザーの詳細（自己紹介・推し）は本人/推し友のみ。ブロックされている事実は応答から分からない設計 | 要ログイン |
| POST | /api/users/:id/block | ブロック（LINE方式：推し友関係は維持。相手からのメッセージが自分にだけ届かなくなる） | 要ログイン |
| POST | /api/users/:id/unblock | ブロック解除 | 要ログイン |
| GET | /api/blocks | 自分がブロック中のユーザー一覧 | 要ログイン |

## チャット（DM・イベントグループ共通）・共有アルバム

| メソッド | パス | 役割 | 認証 |
|---|---|---|---|
| GET | /api/chat/rooms | 参加中トーク一覧（タイトル・最終メッセージ・未読数・ピン状態。ブロック中に送られた非表示メッセージは集計から除外） | 要ログイン |
| POST | /api/chat/rooms/:id/pin | トークをピン止め（一覧最上部に固定） | 要ログイン（メンバーのみ） |
| DELETE | /api/chat/rooms/:id/pin | ピン解除 | 要ログイン |
| GET | /api/chat/rooms/:id/members | ルームメンバー一覧（プロフィール遷移用） | 要ログイン（メンバーのみ） |
| GET | /api/chat/rooms/:id/messages | メッセージ取得（最大200件・古い順）。自分に非表示のメッセージは返さない | 要ログイン（メンバーのみ） |
| GET | /api/chat/rooms/:id/album | 共有アルバムの写真一覧 | 要ログイン（メンバーのみ） |
| POST | /api/chat/rooms/:id/album | 写真追加（`album:new` をルームへリアルタイム配信） | 要ログイン（メンバーのみ） |
| DELETE | /api/chat/rooms/:id/album/:photoId | 写真削除（アップロードした本人のみ） | 要ログイン（本人のみ） |

## 共通イベント・貯金・AI

| メソッド | パス | 役割 | 認証 |
|---|---|---|---|
| GET | /api/events | イベント一覧（参加状況・参加者数・自分の重要度/貯金目標/貯金残高・会場情報・グループトークのルームID付き） | 要ログイン |
| POST | /api/events/:id/join | イベント参加（参加者登録＋個人予定へ自動追加＋イベントチャットへ自動参加。重要度指定可） | 要ログイン |
| POST | /api/events/:id/leave | 参加取消（参加者・自動追加された予定・チャットメンバーから削除） | 要ログイン |
| PUT | /api/events/:id/importance | 参加イベントの重要度設定（normal/important/very_important。ホワイトリスト検証） | 要ログイン（参加者のみ） |
| PUT | /api/events/:id/savings | 貯金目標額の設定（空で解除） | 要ログイン（参加者のみ） |
| GET | /api/events/:id/savings | 貯金状態の取得（目標・残高＝入金合計−出金合計・入出金履歴） | 要ログイン（参加者のみ） |
| POST | /api/events/:id/savings/transactions | 貯金の入金/出金。残高を超える出金は400 | 要ログイン（参加者のみ） |
| POST | /api/events/:id/savings/ai | 貯金サポートAIに相談（Anthropic API・1ユーザー1日10回。キー未設定時はルールベース応答） | 要ログイン（参加者のみ） |
| GET | /api/ai/status | AI利用状況（設定有無・本日の残り回数・上限） | 要ログイン |
| POST | /api/assistant/site | サイト案内AI（アプリの使い方を回答。回数制限なし。キー未設定時は案内文にフォールバック） | 要ログイン |
| GET | /api/events/history | 自分が参加した過去イベント一覧（支出合計・記録数・日記数付き） | 要ログイン |
| GET | /api/events/:id/mylog | そのイベントに紐づく自分の参戦記録・日記 | 要ログイン |
| GET | /api/events/:id/route | 会場→最寄り駅の公共交通ルート（Google Routes API・TRANSIT。所要時間と距離のみ。キー/会場/駅がなければ enabled:false） | 要ログイン |
| POST | /api/events | イベント作成。artist_id設定時はその推しの登録者全員へ新イベント通知 | 管理者 |
| PUT | /api/events/:id | イベント編集 | 管理者 |
| DELETE | /api/events/:id | イベント削除 | 管理者 |

## 管理者専用

| メソッド | パス | 役割 | 認証 |
|---|---|---|---|
| GET | /api/admin/events | イベント一覧＋参加者数（管理画面用） | 管理者 |
| GET | /api/admin/venues | 会場一覧（紐づくイベント数付き） | 管理者 |
| POST | /api/admin/venues | 会場登録（名前・住所必須、緯度経度の範囲検証） | 管理者 |
| PUT | /api/admin/venues/:id | 会場編集 | 管理者 |
| DELETE | /api/admin/venues/:id | 会場削除 | 管理者 |
| GET | /api/admin/oshi-images | 着せ替え画像一覧（`?status=pending/approved/rejected`。既定はpending） | 管理者 |
| POST | /api/admin/oshi-images/:id/:action | 着せ替え画像の承認/却下（action=approve/reject）。承認時に代表画像未設定なら設定。結果を申請者へ通知 | 管理者 |
| GET | /api/admin/oshi-master | 推しマスター一覧（登録人数付き） | 管理者 |
| POST | /api/admin/oshi-master | 推しマスター新規追加（名前重複409） | 管理者 |
| PUT | /api/admin/oshi-master/:id | 推しマスター編集（名前/ジャンル/公式URL/グッズURL/代表画像。名前変更時は重複チェック） | 管理者 |

## 通知センター・Web Push

| メソッド | パス | 役割 | 認証 |
|---|---|---|---|
| GET | /api/notifications | 自分の通知履歴（新しい順・最大50件） | 要ログイン |
| GET | /api/notifications/unread-count | 未読件数（ヘッダーのベルのバッジ用） | 要ログイン |
| POST | /api/notifications/:id/read | 1件既読化（本人の通知のみ） | 要ログイン |
| POST | /api/notifications/read-all | すべて既読化 | 要ログイン |
| GET | /api/push/vapid | VAPID公開鍵の取得 | 不要 |
| POST | /api/push/subscribe | Web Push購読の登録（endpoint重複時はupsert） | 要ログイン |

---

## Socket.io（backend/realtime.js）

接続時に `handshake.auth.token` をHMACトークンで検証（不正なら接続拒否）。
接続すると以下のルームへ自動join（`resync` でやり直し可能）:

| ルーム | 対象 |
|---|---|
| `public_all` | 全員（全体公開つぶやきの配信） |
| `user_{id}` | 本人（通知・個別配信） |
| `oshi_{masterId}` | その推しを登録している人（同担限定つぶやきの配信） |
| `event_{eventId}` | そのイベント参加者（※現在つぶやき配信には未使用。ルーム自体は維持） |
| `room_{roomId}` | 参加中のチャットルーム |

### クライアント→サーバー イベント

| イベント | ペイロード | 内容 |
|---|---|---|
| `resync` | なし | 参加ルームの再計算（推し登録・イベント参加・推し友承認後に呼ぶ） |
| `chat:send` | `{roomId, content, attachment?{url,type,name}}` + ack | チャット送信。メンバー検証・1000字制限・添付3種（image/file/video）。送信時点のブロック関係を hidden_for_user_ids に記録し、ブロックしている受信者を除いて配信＋Push通知 |
| `chat:read` | `{roomId}` + ack | ルーム内の他人のメッセージを既読化（自分に非表示のものは対象外）。既読IDを `chat:read` でルームへ配信 |

### サーバー→クライアント イベント

| イベント | 発生タイミング |
|---|---|
| `chat:message` | 新規チャットメッセージ（ブロック関係がある場合は該当者を除いて個別配信） |
| `chat:read` | 誰かが既読を付けた（readerId・messageIds） |
| `post:new` | 新規つぶやき（public_all または oshi_{masterId} ルームへ） |
| `friend:request` | 推し友申請が届いた |
| `friend:accepted` | 申請が承認された |
| `schedule:changed` | 予定が共有された/更新された（共有先ユーザーへ） |
| `notification:new` | 通知センターへ新着（ベルのバッジ即時更新用） |
| `album:new` | 共有アルバムに写真追加（ルームへ） |

## 定期ジョブ（server.js内・setInterval）

| ジョブ | 間隔 | 内容 |
|---|---|---|
| sendEventReminders | 起動時＋6時間ごと | 参加イベントのカウントダウン通知（14/7/3/2/1/0日前の6段階）。`last_reminded_days` で同段階の二重送信を防止 |
| sendScheduleReminders | 起動時＋5分ごと | 予定の個別リマインド（設定オフセット分前・日本時間で判定）。`reminder_sent_at` を先に原子的に付けて二重送信防止。リマインド時刻を12時間以上過ぎた予定には送らない |

## 通知の種類（notify.js経由の一元送信）

Push送信と通知センター（notificationsテーブル）記録を `notify.send()` に一元化。
カテゴリがオフのユーザーにはPush・記録の両方をスキップ。

| type | カテゴリ設定 | 内容 |
|---|---|---|
| friend_request | notify_friend_request | 推し友申請が届いた |
| friend_accepted | notify_friend_request | 推し友が成立した |
| chat_message | notify_chat_dm / notify_chat_group | DM / イベントグループトークの新着（ルーム種別で判定） |
| event_reminder | notify_event | イベントのカウントダウンリマインド |
| schedule_reminder | （対象外＝常に送る） | 予定の個別リマインド |
| oshi_image_review | （対象外＝常に送る） | 着せ替え画像の審査結果（承認/却下） |
| new_event | （対象外＝常に送る） | 推しの新規イベント追加 |
