# ベースイメージ: Playwright公式イメージ（ブラウザ含む）
FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS base

# このイメージ同梱の Node は 24 系で、Node 26 に対応した Playwright のイメージが無い。
# Node だけ公式バイナリの 26 に差し替える。
# sha256 は https://nodejs.org/dist/v26.13.0/SHASUMS256.txt (署名付き) の値。
# xz が入っていないため .tar.gz を使う。
# CI は BuildKit を使わずビルドするため TARGETARCH が空になる。アーキテクチャは dpkg で判定する。
ARG NODE_VERSION=26.13.0
ARG NODE_SHA256_X64=5848553868b402d3fabb5b09270649977780a390f832155721025a08b5104455
ARG NODE_SHA256_ARM64=439e9c438acdf6a6ffe47418da709153d66c4bed812e30a473faacb107dd2791
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
