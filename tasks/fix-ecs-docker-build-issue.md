# ECS 起動失敗問題の修正（Docker ビルドオプション）

## 概要

ECS に公開している Tools サービス（`nagiyu-root-service-prod`）が起動に失敗している問題を修正します。エラー内容は Docker イメージのマニフェストが見つからないというもので、Docker のビルド設定（BuildKit の無効化）が必要と考えられます。

## 関連情報

- Issue: #（Issue番号を記載）
- タスクタイプ: インフラタスク（ECS + Docker ビルド設定）
- 影響サービス: Tools（`services/tools/`）
- 影響範囲: `infra/root/` および `.github/workflows/root-deploy.yml`

## 問題の詳細

### エラーメッセージ

```
CannotPullContainerError: pull image manifest has been retried 7 time(s):
failed to resolve ref 166562222746.dkr.ecr.us-east-1.amazonaws.com/tools-app-dev:latest@sha256:11f7794eb38212b2f186130a8facc1b94be06c2aa1d9219c664f82326a9b212a:
166562222746.dkr.ecr.us-east-1.amazonaws.com/tools-app-dev:latest@sha256:11f7794eb38212b2f186130a8facc1b94be06c2aa1d9219c664f82326a9b212a: not found
```

### 原因分析

1.  **Docker BuildKit の問題**: `tools-deploy.yml` で `DOCKER_BUILDKIT=0` が設定されていない可能性が高い
2.  **ECS 互換性**: ECS は Docker v2 マニフェスト形式を要求するが、BuildKit 有効時に非互換形式が生成される
3.  **他サービスでの対応実績**: 他のサービス（niconico-mylist-assistant, codec-converter, auth, admin, stock-tracker など）では既に `DOCKER_BUILDKIT=0` を設定済み

**重要な確認事項**:

- Tools の本番環境（Lambda）は正常に動作している → ECR イメージ自体に問題はない
- 問題は ECS が特定のマニフェスト形式を要求することに起因する可能性が高い

### 現状の構成とワークフロー設計

#### インフラ構成

- **ECS 環境**: Fargate + ALB + CloudFront（ルートドメイン用）
- **Lambda 環境**: Lambda + CloudFront（tools.nagiyu.com 用）
- **ECR リポジトリ**: dev 環境の `NagiyuToolsEcrDev` を prod ECS も参照（一時的な構成として問題なし）
- **イメージタグ戦略**: `latest` タグのみ使用

#### ワークフロー責任分担

- **`tools-deploy.yml`**: Docker ビルド＆プッシュ + Lambda デプロイを担当
- **`root-deploy.yml`**: ECS デプロイのみを担当（ビルドは行わない、既存イメージを使用）

この設計により、イメージビルドは `tools-deploy.yml` に集約され、`root-deploy.yml` はデプロイのみに特化します。

## 要件

### 機能要件

- FR1: ECS サービスが正常に起動し、Tools アプリが利用可能になること
- FR2: Docker イメージが ECS で正常に pull できる形式（Docker v2 マニフェスト）でビルドされること
- FR3: `tools-deploy.yml` がビルド、`root-deploy.yml` がデプロイという責任分担を維持すること

### 非機能要件

- NFR1: 他サービスと同様の Docker ビルド設定を適用すること（`DOCKER_BUILDKIT=0`）
- NFR2: ワークフローの実行時間を最小限に抑えること（ビルドの重複を避ける）
- NFR3: Lambda と ECS の両方で同じイメージが動作すること

## 実装方針

### 確定したアプローチ

`tools-deploy.yml` でビルドを担当し、`root-deploy.yml` はデプロイのみを行う現在の設計を維持します。

**修正箇所**: `tools-deploy.yml` の Docker ビルドステップに `DOCKER_BUILDKIT=0` を追加

### 実装の詳細

#### 1. tools-deploy.yml の修正

現在のビルドステップ（139行目付近）:

```yaml
- name: Build and push Docker image
  id: build-image
  env:
    REPOSITORY_URI: ${{ steps.get-ecr.outputs.repository-uri }}
    IMAGE_TAG: ${{ github.sha }}
    APP_VERSION: ${{ steps.get-version.outputs.app-version }}
    # ここに DOCKER_BUILDKIT: 0 を追加
  run: |
    docker build --build-arg APP_VERSION="$APP_VERSION" \
      -t "$REPOSITORY_URI:$IMAGE_TAG" -f services/tools/Dockerfile .
    docker push "$REPOSITORY_URI:$IMAGE_TAG"

    docker tag "$REPOSITORY_URI:$IMAGE_TAG" "$REPOSITORY_URI:latest"
    docker push "$REPOSITORY_URI:latest"
```

#### 2. 他サービスの設定パターン

他のサービスでは以下のように設定されています:

```yaml
env:
  DOCKER_BUILDKIT: 0
```

このパターンに従い、`tools-deploy.yml` にも同様の設定を追加します。

#### 3. repository_memories の知見

```
Docker BuildKit Lambda optimization:
For Lambda Docker builds, use ONLY DOCKER_BUILDKIT=0.
Do NOT use --platform linux/amd64 as it's redundant with classic builder
on linux/amd64 runners.
```

- `DOCKER_BUILDKIT=0` は Lambda だけでなく ECS でも必要
- `--platform linux/amd64` は不要（GitHub Actions ランナーは既に linux/amd64）
- classic Docker builder が Lambda および ECS 互換の Docker v2 マニフェスト形式を生成

## タスク

### Phase 1: 現状確認

- [ ] T001: `tools-deploy.yml` の Docker ビルド設定を確認（139行目付近、`DOCKER_BUILDKIT=0` の有無）
- [ ] T002: 他サービスの設定を参考確認（niconico-mylist-assistant, codec-converter など）

### Phase 2: 修正実装

- [ ] T003: `.github/workflows/tools-deploy.yml` の build-image ステップに `DOCKER_BUILDKIT: 0` を追加
- [ ] T004: ワークフローをトリガーして Docker イメージを再ビルド（BuildKit=0 で `latest` タグを更新）

### Phase 3: ECS デプロイ

- [ ] T005: `root-deploy.yml` を実行して ECS サービスを更新（新しい `latest` イメージを使用）
- [ ] T006: ECS タスク定義が更新され、新しいイメージで起動することを確認

### Phase 4: 動作確認

- [ ] T007: ECS タスクが正常に起動し、Running 状態になることを確認
- [ ] T008: ALB 経由で Tools アプリのホーム画面が表示されることを確認
- [ ] T009: CloudWatch Logs でエラーがないことを確認

### Phase 5: ドキュメント更新

- [ ] T010: `docs/services/tools/deployment.md` に Docker ビルド設定（`DOCKER_BUILDKIT=0`）を明記
- [ ] T011: repository_memories に ECS の Docker ビルド設定に関する知見を記録

## 受け入れ基準

1.  **設定確認**:
    - [ ] `tools-deploy.yml` の build-image ステップに `DOCKER_BUILDKIT: 0` が設定されている
    - [ ] 設定が他サービス（niconico-mylist-assistant 等）と一貫している

2.  **機能確認**:
    - [ ] ECS タスクが正常に起動し、Running 状態になる
    - [ ] ALB 経由で Tools アプリのホーム画面が表示される（ルートドメイン経由）
    - [ ] ALB ターゲットグループのヘルスチェックが成功する

3.  **ドキュメント**:
    - [ ] デプロイドキュメントに Docker ビルド設定（`DOCKER_BUILDKIT=0`）が明記されている
    - [ ] ワークフロー責任分担（`tools-deploy.yml` = ビルド、`root-deploy.yml` = デプロイ）が明確化されている

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

- **`tools-deploy.yml`**: Docker ビルド＆プッシュ + Lambda デプロイを担当
- **`root-deploy.yml`**: ECS デプロイのみを担当（ビルドは行わない）

この設計により、ビルドロジックは `tools-deploy.yml` に集約され、`root-deploy.yml` はシンプルにデプロイのみに特化します。

### 環境とイメージ戦略（確定）

- **ECR リポジトリ**: prod ECS が dev ECR（`NagiyuToolsEcrDev`）を参照する構成は問題なし（一時的な構成として許容）
- **イメージタグ**: `latest` タグのみを使用（commit SHA ベースのタグは不要）
- **動作状況**: Tools の本番環境（Lambda）は正常に動作中 → ECR イメージ自体に問題はない

### 実装の注意点

- **最小限の変更**: `tools-deploy.yml` に `DOCKER_BUILDKIT: 0` を1行追加するのみ
- **他サービスとの整合性**: 既存サービス（niconico-mylist-assistant, codec-converter 等）と同じパターンを適用
- **検証方法**: ワークフロー実行後、ECS で新しいイメージが正常に pull できることを確認
