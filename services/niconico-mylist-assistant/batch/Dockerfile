# ベースイメージ: Playwright公式イメージ（ブラウザ含む）
FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS base

# このイメージ同梱の Node は 24.15.0 で固定されており、セキュリティ修正の入った版を含む
# Playwright のイメージがまだ無い。Node だけ公式バイナリに差し替える。
# sha256 は https://nodejs.org/dist/v24.22.1/SHASUMS256.txt (署名付き) の値。
# xz が入っていないため .tar.gz を使う。
# CI は BuildKit を使わずビルドするため TARGETARCH が空になる。アーキテクチャは dpkg で判定する。
ARG NODE_VERSION=24.22.1
ARG NODE_SHA256_X64=eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c
ARG NODE_SHA256_ARM64=33c37be234ba8bee041961047b19160f4d7d0f164e8e246f78bdd10feff148b3
RUN set -eux; \
    case "$(dpkg --print-architecture)" in \
      amd64) node_arch=x64; node_sha256="${NODE_SHA256_X64}" ;; \
      arm64) node_arch=arm64; node_sha256="${NODE_SHA256_ARM64}" ;; \
      *) echo "未対応のアーキテクチャです: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac; \
    tarball="node-v${NODE_VERSION}-linux-${node_arch}.tar.gz"; \
    curl -fsSL -o "/tmp/${tarball}" "https://nodejs.org/dist/v${NODE_VERSION}/${tarball}"; \
    echo "${node_sha256}  /tmp/${tarball}" | sha256sum -c -; \
    apt-get purge -y nodejs; \
    tar -xzf "/tmp/${tarball}" -C /usr/local --strip-components=1 --no-same-owner; \
    rm "/tmp/${tarball}"; \
    test "$(node --version)" = "v${NODE_VERSION}"; \
    npm --version

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体のpackage.jsonとソースをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/niconico-mylist-assistant/core ./services/niconico-mylist-assistant/core/
COPY services/niconico-mylist-assistant/batch ./services/niconico-mylist-assistant/batch/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci --omit=optional

# モノレポのルートからビルド（共通ライブラリも含めて）
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/browser
RUN npm run build --workspace=@nagiyu/aws
RUN npm run build --workspace=@nagiyu/niconico-mylist-assistant-core
RUN npm run build --workspace=@nagiyu/niconico-mylist-assistant-batch

# 実行ステージ
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# モノレポのルートnode_modulesをコピー（依存関係のホイスティングに対応）
COPY --from=builder /app/node_modules ./node_modules

# 必要なビルド成果物とpackage.jsonをコピー
COPY --from=builder /app/package*.json ./

# 共通ライブラリ
COPY --from=builder /app/libs/common/package*.json ./libs/common/
COPY --from=builder /app/libs/common/dist ./libs/common/dist

# ブラウザライブラリ
COPY --from=builder /app/libs/browser/package*.json ./libs/browser/
COPY --from=builder /app/libs/browser/dist ./libs/browser/dist

# AWS ライブラリ
COPY --from=builder /app/libs/aws/package*.json ./libs/aws/
COPY --from=builder /app/libs/aws/dist ./libs/aws/dist

# Core パッケージ
COPY --from=builder /app/services/niconico-mylist-assistant/core/package*.json ./services/niconico-mylist-assistant/core/
COPY --from=builder /app/services/niconico-mylist-assistant/core/dist ./services/niconico-mylist-assistant/core/dist

# Batch パッケージ
COPY --from=builder /app/services/niconico-mylist-assistant/batch/package*.json ./services/niconico-mylist-assistant/batch/
COPY --from=builder /app/services/niconico-mylist-assistant/batch/dist ./services/niconico-mylist-assistant/batch/dist

# エントリーポイント
CMD ["node", "services/niconico-mylist-assistant/batch/dist/index.js"]
