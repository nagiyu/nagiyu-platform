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

**重要な発見**: `tools-deploy.yml` では既に `DOCKER_BUILDKIT: 0` が設定されている（139行目）。

しかし、エラーメッセージを詳しく見ると：

```
tools-app-dev:latest@sha256:11f7794eb38212b2f186130a8facc1b94be06c2aa1d9219c664f82326a9b212a: not found
```

ECS が `latest` タグと特定の digest (`@sha256:...`) の**両方**で参照しようとしており、この組み合わせが存在しない。

#### 推測される原因

1.  **古い digest へのピン留め**: ECS タスク定義が作成された時点で `latest` タグが指していた古い digest が記録されている
2.  **DOCKER_BUILDKIT=0 追加後の digest 変更**: BuildKit 無効化により新しい manifest 形式でイメージが再ビルドされ、digest が変わった
3.  **タスク定義の未更新**: 新しい digest を持つ `latest` イメージが ECR にあるが、ECS タスク定義は古い digest を参照し続けている

#### 確認事項

- Tools の本番環境（Lambda）は正常に動作している → 新しいイメージ（DOCKER_BUILDKIT=0）は存在し、動作する
- `tools-deploy.yml` で `DOCKER_BUILDKIT: 0` は既に設定済み
- 問題は ECS タスク定義が古い digest を参照していることに起因する可能性が高い

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

`DOCKER_BUILDKIT: 0` は既に設定済みのため、問題は **ECS タスク定義が古い digest を参照していること**と判明。

**修正方針**:

1. **ECS タスク定義の強制更新**: `root-deploy.yml` を実行して、現在の `latest` イメージ（新しい digest）で ECS タスク定義を再作成
2. **CDK の IMAGE_TAG 環境変数**: `root-deploy.yml` が正しく `latest` タグを使用するよう確認

### 実装の詳細

#### 1. root-deploy.yml の IMAGE_TAG 取得ロジック確認

現在の `root-deploy.yml`（126-139行目）:

```yaml
# Get the most recent image tag (sorted by push date)
IMAGE_TAG=$(aws ecr describe-images \
--repository-name "$REPOSITORY_NAME" \
--query 'sort_by(imageDetails,& imagePushedAt)[-1].imageTags[0]' \
--output text \
--region ${{ env.AWS_REGION }})
```

**問題**: `imageTags[0]` は最新イメージの「最初のタグ」を取得するが、それが `latest` とは限らない（commit SHA かもしれない）

**解決策**: 明示的に `latest` タグを使用するよう変更、または `latest` タグが存在するか確認

#### 2. ECS タスク定義の image 参照

`infra/root/ecs-service-stack.ts`（161行目）:

```typescript
const imageTag = process.env.IMAGE_TAG || 'latest';
```

デフォルトは `latest` だが、`root-deploy.yml` から渡される `IMAGE_TAG` が commit SHA の場合、それが使われてしまう。

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

### Phase 1: 現状確認と診断

- [ ] T001: ECR リポジトリ内のイメージ一覧を確認（`latest` タグが存在するか、digest は何か）
- [ ] T002: 現在の ECS タスク定義を確認（どの image URI と digest を参照しているか）
- [ ] T003: `root-deploy.yml` の IMAGE_TAG 取得ロジックを確認（`latest` を取得しているか、commit SHA を取得しているか）

### Phase 2: 修正実装

**オプション A: root-deploy.yml を修正して latest タグを明示的に使用**

- [ ] T004: `root-deploy.yml` の IMAGE_TAG 取得ロジックを修正または削除（常に `latest` を使用）
- [ ] T005: CDK デプロイ時に `IMAGE_TAG=latest` を明示的に設定

**オプション B: 現状のまま root-deploy.yml を再実行**

- [ ] T006: `tools-deploy.yml` を実行して最新イメージが ECR に存在することを確認
- [ ] T007: `root-deploy.yml` を実行して ECS タスク定義を強制的に再作成（新しい digest で）

### Phase 3: ECS サービス更新

- [ ] T008: CDK デプロイで ECS タスク定義が新しいリビジョンとして作成されることを確認
- [ ] T009: ECS サービスが新しいタスク定義を使用して再起動することを確認

### Phase 4: 動作確認

- [ ] T010: ECS タスクが正常に起動し、Running 状態になることを確認
- [ ] T011: ALB 経由で Tools アプリのホーム画面が表示されることを確認
- [ ] T012: CloudWatch Logs でエラーがないことを確認

### Phase 5: ドキュメント更新

- [ ] T013: `docs/services/tools/deployment.md` に ECS の digest ピン留め問題と解決方法を記載
- [ ] T014: repository_memories に ECS の image 参照と digest 問題に関する知見を記録

## 受け入れ基準

1.  **根本原因の特定**:
    - [ ] ECR の `latest` タグが指す digest を確認済み
    - [ ] ECS タスク定義が参照している digest を確認済み
    - [ ] 両者の不一致を確認済み

2.  **機能確認**:
    - [ ] ECS タスクが正常に起動し、Running 状態になる
    - [ ] ALB 経由で Tools アプリのホーム画面が表示される（ルートドメイン経由）
    - [ ] ALB ターゲットグループのヘルスチェックが成功する
    - [ ] エラーメッセージ「CannotPullContainerError」が解消されている

3.  **設定確認**:
    - [ ] `root-deploy.yml` が正しく `latest` タグ（または意図したタグ）を使用している
    - [ ] ECS タスク定義が最新の digest を参照している

4.  **ドキュメント**:
    - [ ] ECS の image digest ピン留めの挙動と解決方法が文書化されている
    - [ ] `root-deploy.yml` の IMAGE_TAG 取得ロジックの改善点が記載されている

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

- **`tools-deploy.yml`**: Docker ビルド＆プッシュ + Lambda デプロイを担当（**既に `DOCKER_BUILDKIT: 0` 設定済み**）
- **`root-deploy.yml`**: ECS デプロイのみを担当（ビルドは行わない）

### 環境とイメージ戦略（確定）

- **ECR リポジトリ**: prod ECS が dev ECR（`NagiyuToolsEcrDev`）を参照する構成は問題なし（一時的な構成として許容）
- **イメージタグ**: `latest` タグのみを使用する意図だが、`root-deploy.yml` が commit SHA を取得している可能性
- **動作状況**: Tools の本番環境（Lambda）は正常に動作中 → 新しいイメージ（DOCKER_BUILDKIT=0）は存在し動作する

### 実装の注意点

- **DOCKER_BUILDKIT=0 は既に設定済み**: これ以上の変更は不要
- **問題は ECS タスク定義の digest 参照**: タスク定義を再作成する必要がある
- **root-deploy.yml の IMAGE_TAG ロジック見直し**:
  - 現状: `imageTags[0]` で最初のタグを取得（`latest` とは限らない）
  - 改善案1: 常に `latest` を使用（環境変数を設定しない、またはハードコード）
  - 改善案2: タグ一覧から明示的に `latest` を検索して使用

### ECS の image digest ピン留めについて

ECS がタスク定義を作成する際、`image:tag` 形式で指定しても、内部的に `image:tag@sha256:digest` 形式でピン留めされる。これにより：

- **メリット**: 同じタスク定義リビジョンは常に同じイメージを使用（再現性）
- **デメリット**: ECR の `latest` タグが新しい digest を指すように更新されても、既存のタスク定義は古い digest を参照し続ける

**解決方法**: タスク定義を再作成（新しいリビジョンを作成）することで、現在の `latest` タグが指す digest を取得させる
