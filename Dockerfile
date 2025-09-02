# crud-back/Dockerfile
FROM node:20-alpine

WORKDIR /app

# package.json と lock ファイルを先にコピー
COPY package*.json ./

# CI用にクリーンインストール（依存関係を全部入れる）
RUN npm ci

# 残りのソースコードをコピー
COPY . .

# dev依存も必要（Nest/TypeORM CLI、tsx など）
RUN npm i -D tsx @nestjs/mapped-types

EXPOSE 3001
