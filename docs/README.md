# 設計資料（docs）

推しログ（OshiLog）の設計資料の素材集。すべて **2026-07-21 時点の実際のコードベース** から抽出した情報で、
実装されていない機能は含めていない（整形・清書用の正確な材料として使う）。

| ファイル | 内容 |
|---|---|
| [screens.md](screens.md) | 画面一覧（全22画面＋ログイン）・各画面の役割・機能・呼び出しAPI・共通レイアウト |
| [screen-flow.md](screen-flow.md) | 画面遷移一覧（ボタン・リンク単位）＋画面遷移図（Mermaid） |
| [api-endpoints.md](api-endpoints.md) | 全APIエンドポイント（約90本）・Socket.ioイベント・定期ジョブ・通知の種類 |
| [db-schema.md](db-schema.md) | 全25テーブルのカラム定義（型・NULL・デフォルト・外部キー）＋ER図（Mermaid）＋マイグレーション・シード |
| [features.md](features.md) | 実装済み機能一覧（カテゴリ別）＋未実装事項の注記 |
| [tech-stack.md](tech-stack.md) | 技術スタック・外部サービス・環境変数・デプロイ構成・システム構成図（Mermaid）・セキュリティ設計 |

## 基本情報

- 本番URL: https://web-production-bd33b.up.railway.app （Railway: web＋PostgreSQL）
- リポジトリ: GitHub `tarutoon7391/OshiLog`（mainブランチで自動デプロイ）
- アカウント: 一般ユーザーは自由登録。デモ `demo`/`demo`、管理者 `admin`/`oshilog-admin`、クライアント `client`/`oshilog-client`
- コンセプト: 「紙の推し活手帳」（ベージュ紙色×ワインレッド×箔押しゴールド・蛍光色不使用）・スマホ向けPWA
