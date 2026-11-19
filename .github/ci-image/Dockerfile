# GitHub Actions のジョブを動かす共通イメージ。ステージ名がそのまま種類の名前になる。
# ブラウザと OS の依存を実行のたびに apt で取ると、ランナーの状態で数十分止まるため、前もってイメージに入れる。
# Playwright の版は、ルートの package.json の @playwright/test と揃える。ずれると、テストがブラウザを見つけられない。

# ステージごとに再宣言しないと、ステージの中では値が見えない
ARG PLAYWRIGHT_VERSION=1.60.0

FROM node:26-slim AS base

# GHCR のパッケージをこのリポジトリに紐づける
LABEL org.opencontainers.image.source="https://github.com/nagiyu/nagiyu-platform"

# actions/checkout が git を使う
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip git \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/awscliv2.zip /tmp/aws

FROM base AS chromium
ARG PLAYWRIGHT_VERSION
# 実行時のユーザーやホームが変わっても同じ場所からブラウザを見つけられるよう、パスを固定する
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --yes playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* /root/.npm

FROM base AS webkit
ARG PLAYWRIGHT_VERSION
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --yes playwright@${PLAYWRIGHT_VERSION} install --with-deps webkit \
    && rm -rf /var/lib/apt/lists/* /root/.npm
