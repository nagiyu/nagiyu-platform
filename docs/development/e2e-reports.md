# E2E HTML レポートのホスティング

各サービスの Playwright E2E テストの HTML レポートは `reports.nagiyu.com` で公開しており、PR コメントから直接開ける。

## URL 体系

```
https://reports.nagiyu.com/{service}/pr-{pr-number}/{run-id}/{project}/index.html
```

| 階層 | 値 | 例 |
|---|---|---|
| `service` | サービス名 | `portal`, `admin`, `auth-app`, `codec-converter`, `niconico-mylist-assistant`, `quick-clip`, `share-together`, `stock-tracker`, `tools` |
| `pr-{pr-number}` | GitHub の PR 番号（人間がたどる用） | `pr-123` |
| `run-id` | GitHub Actions の `${{ github.run_id }}`（globally unique） | `9876543210` |
| `project` | Playwright project 名 | `chromium-mobile`, `chromium-desktop`, `webkit-mobile` |

例:
```
https://reports.nagiyu.com/portal/pr-123/9876543210/chromium-mobile/
```

`run-id` で URL がユニーク化されているため、CI 再実行時も衝突しない。

## ライフサイクル

- S3 バケット側の **3 日**自動削除ルールでオブジェクトが消える
- レポートが必要になったら CI を再実行する運用とする
- 「過去のレポートをずっと残しておく」用途は想定していない（必要なら GitHub Actions の Artifact からダウンロード可能、こちらは 30 日保持）

## アクセス制限

- **public（認証なし）**
- E2E テストは `USE_IN_MEMORY_DB=true` / `SKIP_AUTH_CHECK=true` でダミーデータのみ扱うため、レポートに機微情報は含まれない前提
- リポジトリも public のため、テストコード・パス・アサーションはもともと公開情報

## PR コメントとの連携

各サービスの `*-verify.yml` の `report` ジョブが、PR コメントテーブルに **Report 列** を追加する形でリンクを貼る。

```
| Job | Status | Report |
|-----|--------|--------|
| E2E Tests (chromium-mobile) | ✅ success | [📊 View](https://reports.nagiyu.com/...) |
| E2E Tests (chromium-desktop) | ⏭️ skipped | - |
```

- `success` または `failure` のときだけリンクを表示
- `skipped` / `cancelled` では `-`

## 失敗時の見方

1. PR コメントの「📊 View」リンクをクリック
2. Playwright HTML レポートが開く（テスト一覧・失敗時のスクショ・トレース）
3. 失敗トレース（`.zip`）はリンク先からダウンロードして [trace.playwright.dev](https://trace.playwright.dev/) に投入すると詳細が見える

レポートが 3 日経過して消えていた場合:
- CI を再実行して新しい `run-id` でレポートを再生成
- もしくは GitHub Actions の Artifact（保持期間 30 日）から `playwright-report-*` をダウンロード

## インフラ構成

- S3 バケット `nagiyu-e2e-reports`（環境非依存）
- CloudFront Distribution（OAC 経由で S3 を参照）
- Route53 ALIAS レコード `reports.nagiyu.com → CloudFront`
- 既存の wildcard ACM 証明書（`*.nagiyu.com`）を流用
- CDK 定義: [`infra/shared/lib/reports-hosting-stack.ts`](../../infra/shared/lib/reports-hosting-stack.ts)

## アップロードフロー

各サービスの `*-verify.yml` の E2E ジョブ末尾で以下を実行:

```yaml
- name: Configure AWS credentials for report upload
  if: always()
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: us-east-1

- name: Upload Playwright HTML report to reports.nagiyu.com
  if: always()
  run: |
    aws s3 sync services/{service}/web/playwright-report/ \
      "s3://nagiyu-e2e-reports/{service}/pr-${{ github.event.pull_request.number }}/${{ github.run_id }}/{project}/" \
      --delete --no-progress
```

`if: always()` で E2E が失敗してもアップロードを行う（失敗時こそレポートを見たい）。
