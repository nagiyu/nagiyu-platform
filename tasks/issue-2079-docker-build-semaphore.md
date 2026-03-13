# Docker ビルド排他制御（S3 セマフォ）

## 概要

ワークフローの並列実行時に Docker ビルドが失敗することがある問題を解消する。
`public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1` などの公開 ECR イメージを `COPY --from` で利用する Dockerfile が複数サービスに存在しており、並列実行時に `toomanyrequests: Rate exceeded` が発生している。

S3 オブジェクトをセマフォとして活用し、同時実行中の Docker ビルド数が上限（3）を超えないよう制御する。

## 関連情報

- Issue: #2079
- タスクタイプ: プラットフォームタスク（GitHub Actions + インフラ）
- 影響範囲: Docker ビルドを含む全ワークフロー（15 ファイル、21 ステップ）

## 要件

### 機能要件

- FR1: Docker ビルド開始前に S3 バケット内のロックオブジェクト数を確認し、上限（3）未満であればロックオブジェクトを配置してビルドを開始する
- FR2: 上限以上の場合は 30 秒ごとにポーリングし、上限を下回るまで待機する
- FR3: Docker ビルド完了後（成功・失敗問わず）にロックオブジェクトを削除する
- FR4: ロックオブジェクトにはどのワークフロー・実行が配置したものか、いつ配置したものかがわかる情報を含める
- FR5: S3 バケットを CDK（`infra/shared/` 配下）で管理する
- FR6: GitHub Actions の IAM ロール（ユーザー）がロック用バケットへアクセスできることを確認・保証する

### 非機能要件

- NFR1: ロックは厳密でなくてよい（完全に同タイミングでの取得により一時的に上限を超えることは許容する）
- NFR2: 既存の Docker ビルドの挙動（ビルド・プッシュ処理自体）は変更しない
- NFR3: ロック取得・解放のロジックは再利用可能な形（GitHub Actions composite action 等）で実装することが望ましい

## 調査結果

### 影響を受けるワークフローと Docker ビルド数

以下のワークフローで `docker build` が実行されており、いずれも `public.ecr.aws` の公開イメージを参照する Dockerfile を使用している。

| ワークフローファイル | Docker ビルド数 |
|---|---|
| `.github/workflows/admin-deploy.yml` | 1 |
| `.github/workflows/admin-verify.yml` | 1 |
| `.github/workflows/auth-deploy.yml` | 1 |
| `.github/workflows/auth-verify-app.yml` | 1 |
| `.github/workflows/codec-converter-deploy.yml` | 2 |
| `.github/workflows/codec-converter-verify.yml` | 2 |
| `.github/workflows/niconico-mylist-assistant-deploy.yml` | 2 |
| `.github/workflows/niconico-mylist-assistant-verify.yml` | 2 |
| `.github/workflows/share-together-deploy.yml` | 1 |
| `.github/workflows/share-together-web-verify-fast.yml` | 1 |
| `.github/workflows/share-together-web-verify-full.yml` | 1 |
| `.github/workflows/stock-tracker-deploy.yml` | 2 |
| `.github/workflows/stock-tracker-verify.yml` | 2 |
| `.github/workflows/tools-deploy.yml` | 1 |
| `.github/workflows/tools-verify.yml` | 1 |

### IAM ポリシー確認

`infra/shared/lib/iam/iam-application-policy-stack.ts` の `S3Operations` ステートメントに `s3:PutObject`、`s3:GetObject`、`s3:DeleteObject`、`s3:ListBucket` が既に含まれており、`resources: ['*']` が設定されているため、新規バケットに対する IAM 変更は不要と考えられる。ただし、実装時に改めて確認すること。

### CDK 構成

共有インフラは `infra/shared/` 配下で管理されており、VPC・ACM・IAM を別スタックで定義している。今回追加するロック用 S3 バケットもアプリケーション用途とは異なるため、独立した CDK スタックとして追加する。
`infra/shared/bin/shared.ts` でスタックを登録する必要がある。

## 実装方針

### Phase 1: S3 バケット（CDK スタック）の追加

`infra/shared/` に Docker ビルドロック用の S3 バケットを作成する新しい CDK スタック（例: `DockerBuildLockStack`）を追加する。

スタック設計の考慮点:
- バケット名は環境非依存にする（ロックはどの環境のビルドでも共有するため）
- バケットの公開アクセスはブロックする
- バケット名は固定値（例: `nagiyu-docker-build-lock`）とし、各ワークフローから直接参照する（SSM・シークレット経由の煩雑さを避ける）
- ライフサイクルルールで 1 日以上経過したロックオブジェクトを自動削除する（ビルド失敗時のゾンビロック対策）

### Phase 2: GitHub Actions ロジックの実装

以下のいずれかの方法でロック取得・解放ロジックを実装する（実装時に検討）:

- **composite action**: `.github/actions/docker-build-lock/` に `action.yml` を作成する
- **reusable workflow**: `.github/workflows/` に再利用可能なワークフローとして実装する
- **シェルスクリプト**: `.github/scripts/` にシェルスクリプトとして実装し各ワークフローから呼び出す

ロック取得の擬似アルゴリズム:
```
LOCK_KEY="${GITHUB_WORKFLOW}/${GITHUB_RUN_ID}/${GITHUB_JOB}"
while true:
    count = s3.list-objects(prefix="locks/").count
    if count < 3:
        s3.put-object(key="locks/${LOCK_KEY}", Body='{"workflow": "${GITHUB_WORKFLOW}", "run_id": "${GITHUB_RUN_ID}", "job": "${GITHUB_JOB}", "timestamp": "..."}')
        break
    else:
        sleep 30
```

ロック解放:
```
s3.delete-object(key="locks/{LOCK_KEY}")
```

ロックオブジェクトに含める情報:
- ワークフロー名（`GITHUB_WORKFLOW`）
- 実行 ID（`GITHUB_RUN_ID`）
- ジョブ名（`GITHUB_JOB`）
- 取得日時（Unix タイムスタンプ）

### Phase 3: ワークフローの更新

15 ファイル（21 ステップ）に対してロック取得・解放を挿入する。各 `docker build` ステップの前後に以下を追加する:

- `docker build` 前: ロック取得処理（上述のアルゴリズム）
- `docker build` + `docker push` 完了後: ロック解放処理
- ロック解放は `if: always()` 条件で実行し、ビルド失敗時でも必ず実行されるようにする

## タスク

### Phase 1: S3 バケット（CDK）の追加

- [x] T001: `infra/shared/lib/docker-build-lock-stack.ts` を新規作成する
- [x] T002: ライフサイクルルールを追加してゾンビロック対策を実装する
- [x] T003: `infra/shared/bin/shared.ts` に新スタックを登録する
- [x] T004: `infra/shared/` の CDK テストを更新・追加する
- [x] T005: 既存 IAM ポリシーがロック用バケットに対して必要な権限を付与していることを確認する（`S3Operations` に `s3:PutObject` / `s3:GetObject` / `s3:DeleteObject` / `s3:ListBucket` が含まれるため更新不要）

### Phase 2: ロック取得・解放ロジックの実装

- [ ] T006: 実装方式（composite action / shell script 等）を決定する
- [ ] T007: ロック取得処理を実装する
- [ ] T008: ロック解放処理を実装する
- [ ] T009: S3 バケット名（固定値）をワークフロー内で直接参照する形に統一する

### Phase 3: ワークフローの更新

- [ ] T010: `admin-deploy.yml` を更新する
- [ ] T011: `admin-verify.yml` を更新する
- [ ] T012: `auth-deploy.yml` を更新する
- [ ] T013: `auth-verify-app.yml` を更新する
- [ ] T014: `codec-converter-deploy.yml` を更新する（ビルドジョブ 2 つ）
- [ ] T015: `codec-converter-verify.yml` を更新する（ビルドジョブ 2 つ）
- [ ] T016: `niconico-mylist-assistant-deploy.yml` を更新する（ビルドジョブ 2 つ）
- [ ] T017: `niconico-mylist-assistant-verify.yml` を更新する（ビルドジョブ 2 つ）
- [ ] T018: `share-together-deploy.yml` を更新する
- [ ] T019: `share-together-web-verify-fast.yml` を更新する
- [ ] T020: `share-together-web-verify-full.yml` を更新する
- [ ] T021: `stock-tracker-deploy.yml` を更新する（ビルドジョブ 2 つ）
- [ ] T022: `stock-tracker-verify.yml` を更新する（ビルドジョブ 2 つ）
- [ ] T023: `tools-deploy.yml` を更新する
- [ ] T024: `tools-verify.yml` を更新する

## 参考ドキュメント

- `docs/development/rules.md` - コーディング規約
- `infra/shared/bin/shared.ts` - 共有インフラ CDK エントリーポイント
- `infra/shared/lib/iam/iam-application-policy-stack.ts` - IAM アプリケーションポリシー（S3 権限確認用）
- `infra/shared/lib/vpc-stack.ts` - CDK スタック実装の参考例

## 備考・未決定事項

- S3 バケットは環境非依存の共有バケット（1 つ）とする
- ロック上限数（3）は issue の指示に従い固定値とする
- ロック取得のポーリング間隔（30 秒）は issue の指示に従い固定値とする
- 上限超過の許容については NFR1 のとおり、完全な排他制御は不要
- ゾンビロックのライフサイクル期間は 1 日とする
- `infra/shared/` には CDK テストが存在しない（`tests/` ディレクトリなし）。T004 では新規にテストディレクトリ・テストファイルを作成する必要がある
