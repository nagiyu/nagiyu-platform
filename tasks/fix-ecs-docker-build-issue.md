# ECS 起動失敗問題の修正（latest タグへの簡素化）

## 概要

ECS に公開している Tools サービス（`nagiyu-root-service-prod`）が起動に失敗している問題を、**`latest` タグのみを使用するようリファクタリングすること**で根本的に解決します。

## 関連情報

- Issue: #（Issue番号を記載）
- タスクタイプ: インフラタスク（GitHub Actions ワークフロー + ECS デプロイ設定）
- 影響サービス: Tools（`services/tools/`）
- 影響範囲: `.github/workflows/tools-deploy.yml` および `.github/workflows/root-deploy.yml`

## 問題の詳細

### エラーメッセージ

```
CannotPullContainerError: pull image manifest has been retried 7 time(s):
failed to resolve ref 166562222746.dkr.ecr.us-east-1.amazonaws.com/tools-app-dev:latest@sha256:11f7794eb38212b2f186130a8facc1b94be06c2aa1d9219c664f82326a9b212a:
166562222746.dkr.ecr.us-east-1.amazonaws.com/tools-app-dev:latest@sha256:11f7794eb38212b2f186130a8facc1b94be06c2aa1d9219c664f82326a9b212a: not found
```

### 原因分析

**重要な発見**:

1. `tools-deploy.yml` では既に `DOCKER_BUILDKIT: 0` が設定されている（139行目）
2. ECS が `latest` タグと特定の digest (`@sha256:...`) の**両方**で参照しようとしているが、この組み合わせが存在しない

**根本原因**: ECS タスク定義が古い digest をピン留めしている

1. commit SHA タグ + `latest` タグの両方でイメージを push
2. ECS タスク定義作成時に、`imageTags[0]` が commit SHA タグを取得する可能性
3. または、古い `latest` digest がタスク定義にピン留めされたまま
4. 新しい `latest` イメージ（DOCKER_BUILDKIT=0）は ECR に存在するが、ECS は古い digest を参照

**確認事項**:

- Tools の本番環境（Lambda）は正常に動作している → 新しいイメージ（DOCKER_BUILDKIT=0）は存在し、動作する
- Lambda は既に `:latest` タグを直接使用している（`tools-deploy.yml` 204行目）

### 現状の構成とワークフロー設計

#### インフラ構成

- **ECS 環境**: Fargate + ALB + CloudFront（ルートドメイン用）
- **Lambda 環境**: Lambda + CloudFront（tools.nagiyu.com 用）
- **ECR リポジトリ**: dev 環境の `NagiyuToolsEcrDev` を prod ECS も参照（一時的な構成として問題なし）
- **イメージタグ戦略（現状）**: commit SHA タグ + `latest` タグの両方を使用

#### ワークフロー責任分担

- **`tools-deploy.yml`**: Docker ビルド＆プッシュ + Lambda デプロイを担当
- **`root-deploy.yml`**: ECS デプロイのみを担当（ビルドは行わない、既存イメージを使用）

## 要件

### 機能要件

- FR1: ECS サービスが正常に起動し、Tools アプリが利用可能になること
- FR2: Docker イメージが ECS で正常に pull できる形式（Docker v2 マニフェスト）でビルドされること
- FR3: `tools-deploy.yml` がビルド、`root-deploy.yml` がデプロイという責任分担を維持すること
- FR4: イメージタグ戦略をシンプルにし、digest ピン留め問題を根本的に解決すること

### 非機能要件

- NFR1: `DOCKER_BUILDKIT=0` 設定を維持すること
- NFR2: ワークフローの実行時間を最小限に抑えること（不要な処理を削除）
- NFR3: Lambda と ECS の両方で同じイメージが動作すること

## 実装方針

### 新しいアプローチ: `latest` タグのみを使用

ユーザーからの提案により、**commit SHA タグを廃止し、`latest` タグのみを使用する**方向でリファクタリングします。

**メリット**:

1. **digest ピン留め問題の根本解決**: commit SHA タグがなければ、古い digest への参照が発生しない
2. **ワークフローの簡素化**: 複数タグの管理が不要になる
3. **Lambda との整合性**: 既に Lambda は `:latest` を使用している
4. **ECS との整合性**: ECS も `:latest` のみを参照するようになり、常に最新イメージを使用

**デメリットと対策**:

- **ロールバックの難しさ**: 特定のバージョンに戻すことが難しくなる
  - 対策: 必要に応じて、デプロイ時のログに commit SHA を記録
  - 対策: 緊急時は以前の commit から再ビルド
- **並行デプロイ**: 複数環境への同時デプロイで競合の可能性
  - 対策: 現状は dev/prod で ECR リポジトリが分かれているため問題なし

### 実装の詳細

#### 1. tools-deploy.yml の修正

**現在の処理** (137-150行目):

```yaml
env:
  IMAGE_TAG: ${{ github.sha }}
run: |
  # Build and tag with commit SHA
  docker build --build-arg APP_VERSION="$APP_VERSION" \
    -t "$REPOSITORY_URI:$IMAGE_TAG" -f services/tools/Dockerfile .
  docker push "$REPOSITORY_URI:$IMAGE_TAG"

  # Also tag as latest
  docker tag "$REPOSITORY_URI:$IMAGE_TAG" "$REPOSITORY_URI:latest"
  docker push "$REPOSITORY_URI:latest"

  echo "image-uri=$REPOSITORY_URI:$IMAGE_TAG" >> "$GITHUB_OUTPUT"
```

**修正後**:

```yaml
env:
  IMAGE_TAG: latest
run: |
  # Build and push with latest tag only
  docker build --build-arg APP_VERSION="$APP_VERSION" \
    -t "$REPOSITORY_URI:$IMAGE_TAG" -f services/tools/Dockerfile .
  docker push "$REPOSITORY_URI:$IMAGE_TAG"

  echo "image-uri=$REPOSITORY_URI:$IMAGE_TAG" >> "$GITHUB_OUTPUT"
  echo "commit-sha=${{ github.sha }}" >> "$GITHUB_OUTPUT"
```

**変更点**:

- `IMAGE_TAG` を `${{ github.sha }}` から `latest` に変更
- commit SHA でのビルド・プッシュを削除
- `latest` への tag コマンドを削除（直接 `latest` でビルド）
- デバッグ用に `commit-sha` を output に追加（オプション）

#### 2. root-deploy.yml の修正

**現在の処理** (126-139行目):

```yaml
# Get the most recent image tag (sorted by push date)
IMAGE_TAG=$(aws ecr describe-images \
--repository-name "$REPOSITORY_NAME" \
--query 'sort_by(imageDetails,& imagePushedAt)[-1].imageTags[0]' \
--output text \
--region ${{ env.AWS_REGION }})
```

**修正後**:

```yaml
# Always use latest tag for ECS
IMAGE_TAG="latest"
echo "Using latest tag for ECS deployment"
```

または、IMAGE_TAG の取得自体を削除し、CDK のデフォルト値（`latest`）を使用。

## タスク

### Phase 1: tools-deploy.yml のリファクタリング

- [ ] T001: `.github/workflows/tools-deploy.yml` の `IMAGE_TAG` を `${{ github.sha }}` から `latest` に変更（137行目）
- [ ] T002: commit SHA でのビルド・プッシュコメントを更新（141行目）
- [ ] T003: `docker tag` と2回目の `docker push` を削除（146-148行目）
- [ ] T004: デバッグ用に `commit-sha` output を追加（オプション）

### Phase 2: root-deploy.yml の簡素化

- [ ] T005: `root-deploy.yml` の IMAGE_TAG 取得ロジックを簡素化（126-139行目を削除または `latest` 固定に変更）
- [ ] T006: CDK Deploy で IMAGE_TAG 環境変数を `latest` に固定、またはデフォルト値を使用

### Phase 3: 検証とテスト

- [ ] T007: `tools-deploy.yml` を実行して `latest` タグのみでビルド・プッシュされることを確認
- [ ] T008: ECR リポジトリに `latest` タグのみが存在することを確認（commit SHA タグは新規作成されない）
- [ ] T009: Lambda が正常に更新されることを確認（既に `:latest` を使用しているため問題なし）

### Phase 4: ECS デプロイとテスト

- [ ] T010: `root-deploy.yml` を実行して ECS タスク定義が `latest` タグで作成されることを確認
- [ ] T011: ECS タスクが正常に起動し、Running 状態になることを確認
- [ ] T012: ALB 経由で Tools アプリのホーム画面が表示されることを確認

### Phase 5: ドキュメント更新

- [ ] T013: `docs/services/tools/deployment.md` にイメージタグ戦略（`latest` のみ使用）を明記
- [ ] T014: repository_memories にイメージタグ簡素化の知見を記録

## 受け入れ基準

1.  **ワークフローの簡素化**:
    - [ ] `tools-deploy.yml` が `latest` タグのみでビルド・プッシュする
    - [ ] commit SHA タグでのビルド・プッシュが削除されている
    - [ ] `docker tag` コマンドが不要になっている

2.  **機能確認**:
    - [ ] Lambda が正常に動作する（既に `:latest` を使用）
    - [ ] ECS タスクが正常に起動し、Running 状態になる
    - [ ] ALB 経由で Tools アプリのホーム画面が表示される（ルートドメイン経由）
    - [ ] エラーメッセージ「CannotPullContainerError」が解消されている

3.  **設定確認**:
    - [ ] `root-deploy.yml` が `latest` タグを使用している（または IMAGE_TAG を設定していない）
    - [ ] ECS タスク定義が最新の `latest` digest を参照している
    - [ ] ECR に commit SHA タグが新規作成されていない

4.  **ドキュメント**:
    - [ ] イメージタグ戦略（`latest` のみ使用）が文書化されている
    - [ ] 簡素化によるメリット・デメリットが明記されている

## 参考ドキュメント

- [コーディング規約](../../docs/development/rules.md)
- [Tools デプロイマニュアル](../../docs/services/tools/deployment.md)
- [インフラドキュメント](../../docs/infra/README.md)
- [GitHub Workflows](.github/workflows/)
  - `tools-deploy.yml` - Tools サービスのデプロイ
  - `root-deploy.yml` - ルートドメイン（ECS）のデプロイ
  - 他サービスの deploy.yml - Docker ビルド設定の参考

## 設計方針の確認事項

### ワークフローの役割分担（確定）

- **`tools-deploy.yml`**: Docker ビルド＆プッシュ（**`latest` タグのみ使用**）+ Lambda デプロイを担当
- **`root-deploy.yml`**: ECS デプロイのみを担当（ビルドは行わない、`latest` タグを使用）

### イメージタグ戦略の変更

**以前**: commit SHA タグ + `latest` タグの両方を使用

- メリット: 特定バージョンへのロールバックが容易
- デメリット: digest ピン留め問題、ワークフロー複雑化

**新方針**: `latest` タグのみを使用

- メリット: digest ピン留め問題の根本解決、ワークフロー簡素化、Lambda/ECS の整合性
- デメリット: ロールバック時は commit から再ビルドが必要

### 環境とイメージ戦略（確定）

- **ECR リポジトリ**: prod ECS が dev ECR（`NagiyuToolsEcrDev`）を参照する構成は問題なし（一時的な構成として許容）
- **イメージタグ**: **`latest` タグのみを使用**（commit SHA タグは廃止）
- **動作状況**: Tools の本番環境（Lambda）は正常に動作中 → 新しいイメージ（DOCKER_BUILDKIT=0）は存在し動作する

### ECS の image digest ピン留めについて

ECS がタスク定義を作成する際、`image:tag` 形式で指定しても、内部的に `image:tag@sha256:digest` 形式でピン留めされる。

**従来の問題**:

- commit SHA タグでイメージをビルド → ECR に複数タグが存在
- `root-deploy.yml` が `imageTags[0]` を取得 → commit SHA タグを取得する可能性
- または、古い `latest` digest がピン留めされたまま

**新しいアプローチでの解決**:

- `latest` タグのみでビルド → ECR には `latest` タグしか存在しない
- `root-deploy.yml` は常に `latest` を使用 → IMAGE_TAG 取得ロジックが不要
- タスク定義再作成時、常に最新の `latest` digest が自動的に使用される
