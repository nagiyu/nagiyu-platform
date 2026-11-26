---
sources:
  - infra/stock-tracker/lib/secrets-stack.ts
  - infra/stock-tracker/lib/lambda-stack.ts
  - infra/stock-tracker/bin/stock-tracker.ts
  - .github/workflows/stock-tracker-deploy.yml
sources_hash: 22c899f6aaa72ef9bf1b6d30c6b415bea8425b2c1e52a808995ad3531052f441
---

# シークレット

Web Push の VAPID 鍵と、Finnhub の API キーを持つ Secrets Manager のシークレット。値は、デプロイのときに読まれ、Lambda の環境変数に入る。ログインの JWT を検証する `AUTH_SECRET` は、Auth が作るシークレットを読む。

## リソース

| 名前 | 種類 | 用途 | スタック |
|---|---|---|---|
| `nagiyu-stock-tracker-vapid-{env}` | Secrets Manager のシークレット | Web Push の VAPID 鍵のペア | `NagiyuStockTrackerSecrets{Env}` |
| `nagiyu-stock-tracker-finnhub-api-key-{env}` | Secrets Manager のシークレット | Finnhub の API キー | `NagiyuStockTrackerSecrets{Env}` |
| `nagiyu-auth-nextauth-secret-{env}` | Secrets Manager のシークレット | `AUTH_SECRET` (Auth が作る) | Auth のスタック |

`{env}` は `dev` か `prod`、`{Env}` は `Dev` か `Prod`。タグは `Application` が `nagiyu`、`Service` が `stock-tracker`、`Environment` が環境名。

`AUTH_SECRET` は Auth が作るシークレットを読むだけで、Stock Tracker では作らない。全サービス共通の規約は[認証の規約](../../../../platform/rules/authentication.md)、値と入れ替えの手順は [Auth のシークレット](../../../auth/specs/resource/secrets.md)にある。

## 設定値

| シークレット | 値の形 | 作られたときの値 |
|---|---|---|
| VAPID | JSON `{"publicKey": "...", "privateKey": "..."}` | 公開鍵・秘密鍵とも `PLACEHOLDER`。実際の鍵で上書きする (下の「手順」) |
| Finnhub | JSON `{"apiKey": "..."}` | `PLACEHOLDER`。実際のキーで上書きする (下の「手順」) |

- VAPID 鍵は環境ごとに別の鍵を使う
- Web と、バッチの minute・hourly ([Web の実行環境](./web-runtime.md)、[バッチの実行環境](./batch-runtime.md)) が、同じ VAPID 鍵を使う
- Finnhub のキーは、`priceSource` が `finnhub` の取引所の現在価格の取得に使う ([価格の取得元](../term/price-source.md))。使うのはバッチの minute と hourly だけで、Web には渡さない

## 環境変数

シークレットの値は、デプロイのワークフロー (`.github/workflows/stock-tracker-deploy.yml`) が Secrets Manager から読み、CDK の context で渡す。実行中の Lambda は Secrets Manager を読まない。

| シークレットの値 | CDK の context | 環境変数 |
|---|---|---|
| VAPID の `publicKey` | `vapidPublicKey` | `VAPID_PUBLIC_KEY` ([Web](./web-runtime.md)、[minute と hourly](./batch-runtime.md)) |
| VAPID の `privateKey` | `vapidPrivateKey` | `VAPID_PRIVATE_KEY` ([Web](./web-runtime.md)、[minute と hourly](./batch-runtime.md)) |
| Finnhub の `apiKey` | `finnhubApiKey` | `FINNHUB_API_KEY` ([minute と hourly](./batch-runtime.md)) |
| `AUTH_SECRET` | `nextAuthSecret` | `AUTH_SECRET` ([Web](./web-runtime.md)) |

- context が渡されないときは、仮の値 `PLACEHOLDER` が入る
- 値を変えたら、Stock Tracker を再デプロイしないと動いている Lambda に届かない
- 実行ロールは Secrets Manager を読む権限を持たない
- `infrastructure-app` ジョブが、`AUTH_SECRET`、VAPID、Finnhub の 3 つを `aws-secretsmanager-get-secrets` で読み、`cdk deploy` の `--context` に渡す。シークレットのスタックは、その前の `infrastructure-ecr` ジョブでデプロイするので、初回のデプロイでも読み取りは失敗しない ([デプロイ先](../deploy.md))

## 理由

- Finnhub のキーは、仮の値 `PLACEHOLDER` でシークレットを作り、デプロイのときに環境変数へ渡す。実行時に Secrets Manager を読まず、実行ロールにも読み取りの権限を付けない。キーを入れる前でもデプロイは失敗せず、入れたあとは再デプロイで有効になる

## 手順

AWS CLI は、環境ごとに `--profile nagiyu-dev` か `--profile nagiyu-prod` を付ける。

### Stock Tracker を再デプロイする

値を環境変数へ反映するために、`.github/workflows/stock-tracker-deploy.yml` を手動実行する。入力は `environment` (`dev` か `prod`)。手動実行は、`--ref` で指したブランチのコードをそのままデプロイするので、ブランチを必ず指定する。

| 環境 | `--ref` | 理由 |
|---|---|---|
| prod | `master` | 既定の `develop` から流すと、`develop` のまだリリースしていない資材が本番に出るため |
| dev | 今 dev に載っている資材のブランチ (dev へ最後にデプロイした run のブランチ) | 既定の `develop` から流すと、`integration/**` の版が載っているときに、その版を上書きするため |

```bash
gh workflow run stock-tracker-deploy.yml --ref master -f environment=prod
gh workflow run stock-tracker-deploy.yml --ref <dev に載っているブランチ> -f environment=dev
```

### VAPID 鍵を入れる・作り直す

初回のデプロイでは、シークレットが `PLACEHOLDER` で作られる。実際の鍵で上書きしてから、再デプロイする。

1. 鍵のペアを作る。`web-push` を `--json` 付きで使うと、`{"publicKey":"...","privateKey":"..."}` の形で出るので、そのままシークレットの値に使える

    ```bash
    npx web-push generate-vapid-keys --json
    ```

2. シークレットの値を上書きする

    ```bash
    aws secretsmanager put-secret-value \
        --secret-id nagiyu-stock-tracker-vapid-{env} \
        --secret-string '{"publicKey":"<公開鍵>","privateKey":"<秘密鍵>"}' \
        --region us-east-1 --profile nagiyu-{env}
    ```

3. Stock Tracker を再デプロイする ([Stock Tracker を再デプロイする](#stock-tracker-を再デプロイする))。値はデプロイのときに環境変数へ入るので、上書きしただけでは Lambda に届かない
4. 確かめる。購読を作り直したブラウザでアラートを作り、通知が届くことを見る。届かないときは、再デプロイを忘れていないか (Lambda の `VAPID_PUBLIC_KEY` が `PLACEHOLDER` のままではないか) と、ブラウザの購読が古い鍵のままではないかを見る

鍵を作り直すと、古い鍵で作られた購読には送れなくなる。通知を受けたいブラウザは、購読を作り直す。

### Finnhub の API キーを入れる

初回のデプロイでは、シークレットが `PLACEHOLDER` で作られる。Finnhub で発行した API キーで上書きしてから、再デプロイする。

1. シークレットの値を上書きする

    ```bash
    aws secretsmanager put-secret-value \
        --secret-id nagiyu-stock-tracker-finnhub-api-key-{env} \
        --secret-string '{"apiKey":"<API キー>"}' \
        --region us-east-1 --profile nagiyu-{env}
    ```

2. Stock Tracker を再デプロイする ([Stock Tracker を再デプロイする](#stock-tracker-を再デプロイする))。値はデプロイのときに環境変数へ入るので、上書きしただけでは Lambda に届かない
3. 確かめる。`priceSource` が `finnhub` の取引所のアラートが、価格を取れて判定されることを、minute か hourly のログで見る。取れないときは、再デプロイを忘れていないか (Lambda の `FINNHUB_API_KEY` が `PLACEHOLDER` のままではないか) を見る
