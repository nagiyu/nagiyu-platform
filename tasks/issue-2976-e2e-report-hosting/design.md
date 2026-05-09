# E2E HTML レポートホスティング - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/ に ADR として抽出し、
    tasks/issue-2976-e2e-report-hosting/ ディレクトリごと削除します。
-->

## ゴール

`reports.nagiyu.com` で各サービスの Playwright HTML レポートを公開し、PR コメントから直接開けるようにする。

## アーキテクチャ概要

```
GitHub Actions (E2E job)
  └─ aws s3 sync playwright-report/ → S3 bucket
                                              │
Browser (PR reviewer)                          │
  └─ https://reports.nagiyu.com/...            │
        ↓                                       │
Route53 (reports.nagiyu.com → ALIAS)            │
        ↓                                       │
CloudFront (新規 distribution)                  │
        ↓ OAC                                   │
S3 bucket ←──────────────────────────────────────┘
  └─ Lifecycle: 3 日で自動削除
```

## CDK 実装場所

**結論: `infra/shared/` 配下に新規スタックとして追加**

### 検討した選択肢

| 案 | メリット | デメリット |
|---|---|---|
| A. `infra/reports/` を新規作成 | サービスと同じ独立構造で対称性が高い | 新規パッケージのオーバーヘッド（package.json / tsconfig 等） |
| B. `infra/shared/lib/reports-hosting-stack.ts` 追加 | プラットフォーム横断リソースとして既存 `DockerBuildLockStack` `ErrorEventsTableStack` と並列、軽量 | shared にデプロイ系リソースが混ざる |

**B を採用**: 全サービスで共有される CI 基盤リソースであり、`DockerBuildLockStack`（同じく CI 用 S3 バケット）の前例がある。

### 追加するスタック

`infra/shared/lib/reports-hosting-stack.ts`:
- S3 バケット（`nagiyu-e2e-reports`）
    - encryption: S3_MANAGED
    - blockPublicAccess: BLOCK_ALL（CloudFront OAC 経由のみ）
    - lifecycle: 3 日で削除
- CloudFront Distribution
    - origin: S3 (Origin Access Control)
    - 既存の wildcard ACM 証明書（`*.nagiyu.com`）を SSM 経由で参照
    - エイリアスドメイン: `reports.nagiyu.com`
    - default behavior: CACHING_OPTIMIZED（URL に `run_id` が含まれるため同じ URL で内容が変わらず、キャッシュの安全性が担保される）
    - default root object: `index.html`
- Route53 ARecord
    - `reports.nagiyu.com` → CloudFront ALIAS

`infra/shared/bin/shared.ts` に `ReportsHostingStack` の追加を反映。

## ACM 証明書

**結論: 既存の wildcard `*.nagiyu.com` を流用**

`infra/shared/lib/acm-stack.ts` で既に `*.nagiyu.com` の wildcard 証明書を発行しており、SSM Parameter `SSM_PARAMETERS.ACM_CERTIFICATE_ARN` で参照可能。`reports.nagiyu.com` はそのカバー範囲内なので、新規証明書は発行しない。

## 環境分離

**結論: 環境分離なし（dev/prod の区別をしない）**

E2E は PR の verify ジョブで実行されるものであり、master PR では発火しない（既存ワークフローの `on.pull_request.branches: [integration/**, develop]` で確認済み）。よってレポートは「dev 寄りの開発成果物」しか存在せず、本番系と分離する動機がない。

S3 バケット名・CloudFront・Route53 レコードはすべて 1 セットのみ。

## URL 体系

```
https://reports.nagiyu.com/{service}/pr-{pr-number}/{run-id}/{project}/index.html
```

| 階層 | 値 | 例 |
|---|---|---|
| service | サービス名 | `portal` / `admin` / `auth-app` / ... |
| pr-{pr-number} | PR 番号（人間がたどる用） | `pr-123` |
| run-id | GitHub Actions の `run_id` | `9876543210` |
| project | Playwright project 名 | `chromium-mobile` |

`run-id` は globally unique なので、再実行時も衝突しない。

## CI ワークフロー変更

### E2E ジョブに追加するステップ

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: us-east-1

- name: Upload Playwright report to S3
  if: always()
  run: |
    aws s3 sync services/portal/web/playwright-report/ \
      "s3://nagiyu-e2e-reports/portal/pr-${{ github.event.pull_request.number }}/${{ github.run_id }}/chromium-mobile/" \
      --delete

- name: Output report URL
  if: always()
  id: report-url
  run: |
    echo "url=https://reports.nagiyu.com/portal/pr-${{ github.event.pull_request.number }}/${{ github.run_id }}/chromium-mobile/" >> "$GITHUB_OUTPUT"
```

### IAM 権限

既存の `secrets.AWS_ACCESS_KEY_ID` で使われる IAM ユーザー（`infra/shared/lib/iam/iam-application-policy-stack.ts` の application policy）には既に `s3:PutObject` / `s3:GetObject` / `s3:DeleteObject` が `resources: ['*']` で付与されているため、**追加の IAM 変更は不要**。

### Report ジョブの変更

各 `*-verify.yml` の `report` ジョブで生成している PR コメントテーブルに、HTML レポートのリンク列を追加する。

```javascript
// 既存
const results = {
  'E2E Tests (chromium-mobile)': '${{ needs.e2e-test-chromium-mobile.result }}',
  // ...
};

// 追加
const reportUrls = {
  'E2E Tests (chromium-mobile)': 'https://reports.nagiyu.com/portal/pr-{pr}/{run-id}/chromium-mobile/',
  // ...
};

// テーブルに Report 列を追加
body += '| Job | Status | Report |\n';
body += '|-----|--------|--------|\n';
for (const [job, result] of Object.entries(results)) {
  const url = reportUrls[job];
  const link = url ? `[📊 View](${url})` : '-';
  body += `| ${job} | ${emoji} ${result} | ${link} |\n`;
}
```

## 実装ステップ（PoC PR）

1. `infra/shared/lib/reports-hosting-stack.ts` 新規作成
2. `infra/shared/bin/shared.ts` にスタック追加
3. `.github/workflows/portal-verify.yml` の E2E ジョブに S3 アップロード追加
4. `.github/workflows/portal-verify.yml` の Report ジョブに HTML レポートリンク追加
5. `docs/development/e2e-reports.md`（仮）に運用ドキュメント追加
6. CI を実行し、実物のレポート HTML が想定通り公開されることを確認
7. レポート HTML に機微情報が含まれていないことを目視確認

## 横展開 PR（別 PR）

PoC が動いたら、残り 8 サービスの `*-verify.yml` に同じパターンを適用する:

- `admin-verify.yml`
- `auth-verify-app.yml`
- `codec-converter-verify.yml`
- `niconico-mylist-assistant-verify.yml`
- `quick-clip-verify.yml`
- `share-together-verify.yml`
- `stock-tracker-verify.yml`
- `tools-verify.yml`

## 確定済み方針（user 確認済み）

1. **CDK 実装場所**: `infra/shared/lib/reports-hosting-stack.ts`
2. **S3 バケット名**: `nagiyu-e2e-reports`
3. **CloudFront キャッシュポリシー**: `CACHING_OPTIMIZED`（URL に `run_id` を含むため安全）
4. **OAC**: 新規構築のため Origin Access Control を採用
5. **CDK スタック名**: `NagiyuE2eReportsHosting`
6. **PR コメント表示形式**: 既存テーブルに Report 列を追加（各 E2E 行に `[📊 View](url)`）

## docs/ への移行メモ

- [ ] `docs/development/e2e-reports.md`（新規）に運用ドキュメントを作成
    - URL 体系
    - ライフサイクル（3 日で削除、CI 再実行で再生成）
    - PR コメントからのアクセス方法
    - トラブル時の見方（S3 直接 / Artifact フォールバック）
- [ ] `docs/branching.md` に「E2E レポートが reports.nagiyu.com で公開されている」旨を追記（任意）
