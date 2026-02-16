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

### 推測される原因

1.  **Docker BuildKit の問題**: ECS は Docker v2 マニフェスト形式が必要だが、BuildKit が有効の場合に互換性のない形式で生成される可能性
2.  **他サービスでの対応**: 他のサービス（niconico-mylist-assistant, codec-converter, auth, admin, stock-tracker など）では既に `DOCKER_BUILDKIT=0` を設定済み
3.  **root-deploy.yml の未設定**: `root-deploy.yml` ワークフローでは Docker ビルド処理が存在しないため、ビルド設定の追加が必要

### 現状の構成

- **インフラ構成**: ECS Fargate + ALB + CloudFront
- **イメージソース**: Tools サービスの dev 環境 ECR リポジトリ（`NagiyuToolsEcrDev`）を参照
- **デプロイフロー**: `root-deploy.yml` が CDK スタックをデプロイ（ECR イメージは既存のものを使用）

## 要件

### 機能要件

- FR1: ECS サービスが正常に起動し、Tools アプリが利用可能になること
- FR2: Docker イメージが ECS で正常に pull できる形式でビルドされること
- FR3: 既存の `tools-deploy.yml` ワークフローと整合性を保つこと

### 非機能要件

- NFR1: 他サービスと同様の Docker ビルド設定を適用すること（`DOCKER_BUILDKIT=0`）
- NFR2: デプロイワークフローの実行時間を最小限に抑えること
- NFR3: Lambda デプロイとの整合性を維持すること（Tools は Lambda と ECS の両方で動作）

## 実装のヒント

### 1. Docker ビルド設定の統一

他サービスのワークフローでは以下のパターンで `DOCKER_BUILDKIT=0` が設定されています:

```yaml
- name: Build and push Docker image
  env:
    DOCKER_BUILDKIT: 0
  run: |
    docker build -t $REPOSITORY_URI:$IMAGE_TAG -f path/to/Dockerfile .
    docker push $REPOSITORY_URI:$IMAGE_TAG
```

### 2. root-deploy.yml の構成確認

現在の `root-deploy.yml` は以下の構成:

1.  CDK Synth（検証）
2.  CDK Deploy（All Stacks）
    - ECS サービススタック（`infra/root/ecs-service-stack.ts`）をデプロイ
    - 既存の ECR イメージ（`NagiyuToolsEcrDev` の latest）を使用

### 3. 修正方針

以下のいずれかのアプローチが考えられます:

#### アプローチA: tools-deploy.yml のビルド設定確認

- `tools-deploy.yml` で既に `DOCKER_BUILDKIT=0` が設定されているか確認
- 設定されている場合: ECS のタスク定義が参照しているイメージタグを確認
- 設定されていない場合: `tools-deploy.yml` に `DOCKER_BUILDKIT=0` を追加

#### アプローチB: root-deploy.yml にビルドステップ追加

- `root-deploy.yml` に Docker イメージのビルド＆プッシュステップを追加
- `tools-deploy.yml` と同様のビルド処理を実装
- ECR リポジトリは `NagiyuToolsEcrDev` を使用

#### アプローチC: ワークフローの統合検討

- `root-deploy.yml` と `tools-deploy.yml` の役割を整理
- Tools サービスのビルドは `tools-deploy.yml` に一元化
- `root-deploy.yml` は ECS デプロイのみに特化

### 4. repository_memories の活用

プロジェクトのメモリには以下の重要な情報があります:

```
Docker BuildKit Lambda optimization:
For Lambda Docker builds, use ONLY DOCKER_BUILDKIT=0.
Do NOT use --platform linux/amd64 as it's redundant with classic builder
on linux/amd64 runners.
```

- Lambda だけでなく、ECS でも同様の設定が必要
- `--platform linux/amd64` は不要（GitHub Actions ランナーは linux/amd64）
- classic Docker builder（BuildKit=0）が Lambda および ECS 互換の形式を生成

## タスク

### Phase 1: 現状分析

- [ ] T001: `tools-deploy.yml` の Docker ビルド設定を確認（`DOCKER_BUILDKIT=0` の有無）
- [ ] T002: `root-deploy.yml` のイメージ参照方法を確認（どのタグを使用しているか）
- [ ] T003: ECS タスク定義の現在のイメージタグを確認（`infra/root/ecs-service-stack.ts`）
- [ ] T004: ECR リポジトリのイメージ一覧を確認（正しくプッシュされているか）

### Phase 2: 修正実装

- [ ] T005: `tools-deploy.yml` に `DOCKER_BUILDKIT=0` を追加（未設定の場合）
- [ ] T006: Docker イメージの再ビルド＆プッシュ（BuildKit=0 で）
- [ ] T007: ECS タスク定義の更新（必要に応じて）
- [ ] T008: ECS サービスの再起動（新しいイメージを pull させる）

### Phase 3: テスト＆検証

- [ ] T009: ECS タスクの起動確認（エラーが解消されたか）
- [ ] T010: Tools アプリのホーム画面表示確認（正常に動作するか）
- [ ] T011: ヘルスチェックの確認（ALB ターゲットグループのヘルスチェック）
- [ ] T012: CloudWatch Logs の確認（エラーログがないか）

### Phase 4: ドキュメント更新

- [ ] T013: `docs/services/tools/deployment.md` の更新（Docker ビルド設定を明記）
- [ ] T014: `docs/infra/README.md` または関連ドキュメントの更新（ECS 固有の注意事項）
- [ ] T015: repository_memories への記録（ECS の Docker ビルド設定について）

## 受け入れ基準

1.  **機能確認**:
    - [ ] ECS タスクが正常に起動し、Running 状態になる
    - [ ] ALB 経由で Tools アプリのホーム画面が表示される
    - [ ] ヘルスチェックが成功する

2.  **設定確認**:
    - [ ] `tools-deploy.yml` に `DOCKER_BUILDKIT=0` が設定されている
    - [ ] ECR に BuildKit=0 でビルドされたイメージが存在する
    - [ ] ECS タスク定義が正しいイメージを参照している

3.  **ドキュメント**:
    - [ ] デプロイドキュメントに Docker ビルド設定が記載されている
    - [ ] ECS 固有の注意事項が記載されている

## 参考ドキュメント

- [コーディング規約](../../docs/development/rules.md)
- [Tools デプロイマニュアル](../../docs/services/tools/deployment.md)
- [インフラドキュメント](../../docs/infra/README.md)
- [GitHub Workflows](.github/workflows/)
  - `tools-deploy.yml` - Tools サービスのデプロイ
  - `root-deploy.yml` - ルートドメイン（ECS）のデプロイ
  - 他サービスの deploy.yml - Docker ビルド設定の参考

## 備考・未決定事項

### 検討事項

1.  **ワークフローの役割分担**:
    - `tools-deploy.yml`: Lambda 向けビルド＆デプロイ
    - `root-deploy.yml`: ECS 向けデプロイ（イメージは tools-deploy.yml で作成されたものを使用）
    - 現状の構成が最適か、統合が必要か検討

2.  **環境の統一**:
    - 現在、prod の ECS は dev の ECR リポジトリを参照
    - 将来的に prod 専用の ECR リポジトリが必要か検討

3.  **イメージタグ戦略**:
    - `latest` タグのみか、commit SHA ベースのタグも使用するか
    - ECS のデプロイ頻度とイメージ管理方針を明確にする

### 注意点

- **最小限の変更**: まずは `DOCKER_BUILDKIT=0` の追加のみに留め、動作確認してから追加の改善を検討
- **他サービスとの整合性**: 既存サービスのパターンに従い、統一された設定を維持
- **デプロイの影響**: 本番環境への影響を最小限にするため、dev 環境で十分にテストしてから適用
