# Railwayデプロイ用：フロントエンドをビルドし、Expressが静的配信＋APIを担当する1コンテナ構成
FROM node:24-alpine

WORKDIR /app

# フロントエンドのビルド
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
RUN cd frontend && npm run build

# バックエンド（本番用依存のみ）
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev
COPY backend backend

ENV NODE_ENV=production

CMD ["node", "backend/server.js"]
