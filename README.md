# 💗 推しログ（OshiLog）

推し活をぜんぶ記録できる、推し活サポートアプリです。
アジャイル開発課題の「動くたたき台」から発展させ、**紙の推し活手帳**をコンセプトにした
本番仕様（SNS・リアルタイム機能つき）にアップグレードしました。

## 🌐 デプロイURL（本番環境）

**https://web-production-bd33b.up.railway.app**

- ID・パスワードで登録／ログインできます（メールアドレス不要）。
- お試し用アカウント：`demo` / パスワード `demo`
- **管理者アカウント：`admin` / パスワード `oshilog-admin`**（イベントの作成・編集・削除ができます）

## ✨ 機能一覧

### 基本機能
| 機能 | 内容 |
|---|---|
| 推し登録・管理 | ジャンルブロック→タップでポラロイド風タイルが展開。同名の推しは共有マスターに集約し「◯人が登録中」を表示 |
| カレンダー | iPhoneカレンダー準拠の縦スクロール連続月ビュー。日付タップで選択、ダブルタップで1日詳細、予定検索 |
| 参戦記録・家計簿 | 日付・内容・金額・メモを記録。月別合計、推し別の円グラフ・月別推移の棒グラフ |
| グッズコレクション | 画像付きで登録、カテゴリで絞り込み |
| つぶやき | 公開範囲を選んで投稿。タイムラインにリアルタイム反映 |

### 追加機能（本番仕様）
| 機能 | 内容 |
|---|---|
| 認証・プロフィール | ID＋パスワード（**scryptでハッシュ化**して保存）。表示名・アイコン・自己紹介を編集 |
| 推し友（フレンド） | 相互承認制。同じ推しの人をランダムでおすすめ（共通の推し名を表示） |
| リアルタイムトーク | Socket.ioによるDM・イベントグループチャット。推し友／参加者だけがアクセス可能 |
| つぶやき公開範囲 | プライベート／全体／同じ推し／同じイベント参加者の4種。**サーバー側で閲覧可否を判定** |
| 共通イベント | 管理者が作成。参加すると個人カレンダーに自動追加＋参加者専用チャットに自動参加 |
| 予定共有 | 予定ごとに共有ON/OFF。共有予定は推し友のカレンダーに色分け表示 |
| 管理者機能 | `/admin` でイベントのCRUD・参加者数確認（**権限はサーバー側で判定**、一般ユーザーは不可） |
| 通知（Web Push） | PWA化＋VAPID方式のプッシュ通知（メッセージ・申請・イベントリマインド） |

## 🛠 技術スタック

- **フロントエンド**: React 19 + Vite 7 + TailwindCSS 4 + recharts + React Router + socket.io-client
- **バックエンド**: Node.js + Express + Socket.io + web-push
- **DB**: PostgreSQL（Railway）
- **認証**: ID/パスワード（scryptハッシュ＋HMAC署名トークン）
- **デプロイ**: Railway（Dockerfile。Expressがフロントのビルド成果物を配信する1サービス＋PostgreSQL）
- **PWA**: manifest.json + Service Worker（ホーム画面追加・Web Push対応）

## 🎨 デザイン

紙の推し活手帳をコンセプトに、ベージュ（`#E8DFCE`）の背景に罫線、
アクセントはワインレッド（`#8B3A4A`）。推しタイルやグッズはポラロイド風、
カレンダーの選択日はスタンプの丸囲み風。蛍光色・ネオンカラーは使用していません。

## 💾 主なDBテーブル

`users`(is_admin等) / `oshi_master`(共有マスター) / `oshi`(個人の推し) / `schedules`(event_id・is_shared) /
`records` / `goods` / `posts`(visibility・event_id) / `friendships` / `chat_rooms` / `chat_room_members` /
`chat_messages` / `events` / `event_participants` / `push_subscriptions`

テーブルはサーバー起動時に自動作成・マイグレーションされます（`CREATE TABLE IF NOT EXISTS` ＋ `ALTER ... ADD COLUMN IF NOT EXISTS`）。

## 🚀 ローカルでの起動方法

Node.js 20以上と、接続できるPostgreSQLが必要です。

```powershell
# 依存インストール
cd backend; npm install
cd ../frontend; npm install

# バックエンド起動（別ターミナル）
cd backend
$env:DATABASE_URL = "postgresql://ユーザー:パスワード@ホスト:5432/DB名"
$env:TOKEN_SECRET = "任意の秘密鍵"
# 通知を試す場合は VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY も設定（web-push generate-vapid-keys で生成）
node server.js

# フロントエンド起動（開発モード。/api と /socket.io は localhost:3000 へプロキシ）
cd frontend; npm run dev
```

ブラウザで http://localhost:5173 を開く。

## ☁️ Railwayへのデプロイ

```powershell
railway up --ci -s web   # リポジトリ直下で実行（Dockerfileでビルド）
```

環境変数（`web` サービス）：
- `DATABASE_URL = ${{Postgres.DATABASE_URL}}`（参照変数）
- `TOKEN_SECRET`（トークン署名用）
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`（Web Push用）

## 🔔 通知（Web Push）の使い方

1. プロフィール画面の「通知をオンにする」をタップ→ブラウザの許可ダイアログで許可
2. 以降、推し友のメッセージ・申請、参加イベントのリマインドが通知されます
3. **iPhone/iPadは、Safariの共有→「ホーム画面に追加」をしてから起動しないと通知が機能しません**
4. 通知を拒否しても、アプリの他の機能は問題なく使えます（通知は必須ではありません）

## 📝 今後の拡張予定（要件整理用メモ）

- [ ] メッセージの既読表示・未読バッジ
- [ ] 推しマスターの表記ゆれ吸収（別名・英語名）
- [ ] 画像はストレージ保存に変更（現在はBase64でDB保存・2MB上限）
- [ ] イベントのカテゴリ・ジャンル別フィルタ
- [ ] 通知の種類ごとのON/OFF設定

## ⚠️ プロトタイプとしての割り切り

- 画像はBase64でDBに保存（2MB上限）。本来はストレージサービスを使うべき
- テストコード・CI/CDは未整備（動作優先。ただしAPI・リアルタイムの疎通は手動テスト済み）
- 決済機能・外部SNS連携なし（金額は数値入力、つぶやき・トークはアプリ内完結）
