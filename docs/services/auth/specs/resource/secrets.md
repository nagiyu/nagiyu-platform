---
sources:
  - infra/auth/lib/secrets-stack.ts
  - infra/auth/lib/stripe-secrets-stack.ts
  - infra/auth/lib/lambda-stack.ts
  - infra/common/src/utils/secrets.ts
  - .github/workflows/auth-deploy.yml
  - services/auth/core/src/billing/stripe-client.ts
sources_hash: f3994ba94eb1e5b15bbfddfa382388a3f0cdd0c87fff7c1b0a158a23b6bb9d68
---

# シークレット

Google OAuth のクライアント、ログインの JWT を暗号化する鍵の `AUTH_SECRET`、Stripe の鍵を持つ Secrets Manager のシークレット。値は、デプロイのときに読まれ、Lambda の環境変数に入る。

## リソース

| 名前 | 種類 | 用途 | スタック |
|---|---|---|---|
| `nagiyu-auth-google-oauth-{env}` | Secrets Manager のシークレット | Google OAuth のクライアント | `NagiyuAuthSecrets{Env}` |
| `nagiyu-auth-nextauth-secret-{env}` | Secrets Manager のシークレット | `AUTH_SECRET` (セッションの JWT を暗号化する鍵) | `NagiyuAuthSecrets{Env}` |
| `nagiyu-auth-stripe-{env}` | Secrets Manager のシークレット | Stripe の秘密鍵と、通知の署名鍵 | `NagiyuAuthStripeSecrets{Env}` |

`{env}` は `dev` か `prod`、`{Env}` は `Dev` か `Prod`。名前は `infra/common` のレジストリが持つ。名前を変えるとシークレットが置き換わり、入れた値が引き継がれない。

## 設定値

| シークレット | 値 | 作られ方 |
|---|---|---|
| Google OAuth | JSON `{"clientId": "...", "clientSecret": "..."}` | 仮の値 `PLACEHOLDER_CLIENT_ID`、`PLACEHOLDER_CLIENT_SECRET` で作られ、実際の値で上書きする (下の「手順」) |
| `AUTH_SECRET` | 32 文字のランダムな文字列 (`"`、`@`、`/`、`\` を除く) | デプロイで自動生成する。手で作らない |
| Stripe | JSON `{"secretKey": "...", "webhookSecret": "..."}` | 仮の値 `PLACEHOLDER_SECRET_KEY`、`PLACEHOLDER_WEBHOOK_SECRET` で作られ、実際の値で上書きする ([Stripe](./stripe.md)) |

- `AUTH_SECRET` は、Auth と、同じ値を読むすべてのサービスで同じ値にする ([認証の規約](../../../../platform/rules/authentication.md))。作るのは Auth だけで、ほかのサービスはこのシークレットを読む
- Stripe の秘密鍵と署名鍵のどちらかが空か、`PLACEHOLDER_` で始まる間は、課金が無効になる。無効のときの各経路の挙動は[課金 API](../api/billing.md)と[プラン画面](../screen/plans.md)にある
- タグは `Application` が `nagiyu`、`Service` が `auth`、`Environment` が環境名

## 環境変数

シークレットの値は、デプロイのワークフロー (`.github/workflows/auth-deploy.yml`) が Secrets Manager から読み、CDK の context で渡す。実行中の Lambda は Secrets Manager を読まない。

| シークレットの値 | CDK の context | 環境変数 ([実行環境](./web-runtime.md)) |
|---|---|---|
| Google OAuth の `clientId` | `googleClientId` | `GOOGLE_CLIENT_ID` |
| Google OAuth の `clientSecret` | `googleClientSecret` | `GOOGLE_CLIENT_SECRET` |
| `AUTH_SECRET` | `nextAuthSecret` | `AUTH_SECRET` |
| Stripe の `secretKey` | `stripeSecretKey` | `STRIPE_SECRET_KEY` |
| Stripe の `webhookSecret` | `stripeWebhookSecret` | `STRIPE_WEBHOOK_SECRET` |

- 値を変えたら、Auth を再デプロイしないと動いている Lambda に届かない
- 実行ロールは Secrets Manager を読む権限を持たない

## 理由

- Stripe の鍵は、ほかのシークレットと別のスタックに置く。人が Stripe の管理画面で発行して入れた値を、デプロイで消さないため。dev では develop の版と integration の版が後勝ちで上書きし合う。新しいシークレットを既存のスタックに足すと、それを持たない版をデプロイしたとき、スタックからシークレットが外れ、人が入れた値が消える。削除されずに残る設定にしても、名前が固定のため、作り直しのときに名前が衝突して失敗しうる。専用のスタックなら、その版に無いスタックにはデプロイが触れないので、値が残る
- 鍵が空か仮の値のままなら、課金を無効として扱う。鍵を入れる前でも Auth はデプロイでき、ログインとユーザー管理は動く。特定商取引法に基づく表記は、課金が無効の間も表示される

## 手順

AWS CLI は、環境ごとに `--profile nagiyu-dev` か `--profile nagiyu-prod` を付ける。

### Auth を再デプロイする

値を環境変数へ反映するために、`.github/workflows/auth-deploy.yml` を手動実行する。入力は `environment` (`dev` か `prod`)。手動実行は、`--ref` で指したブランチのコードをそのままデプロイするので、ブランチを必ず指定する。

| 環境 | `--ref` | 理由 |
|---|---|---|
| prod | `master` | 既定の `develop` から流すと、`develop` のまだリリースしていない資材が本番に出るため |
| dev | 今 dev に載っている資材のブランチ (dev へ最後にデプロイした run のブランチ) | 既定の `develop` から流すと、`integration/**` の版が載っているときに、その版を上書きするため |

```bash
gh workflow run auth-deploy.yml --ref master -f environment=prod
gh workflow run auth-deploy.yml --ref <dev に載っているブランチ> -f environment=dev
```

### Google OAuth のクライアントを用意する

1. Google Cloud Console で、種類が Web アプリケーションの OAuth クライアントを作る。承認済みのリダイレクト URI は、環境ごとに次のとおりにする
    - dev: `https://auth.dev.nagiyu.com/api/auth/callback/google`
    - prod: `https://auth.nagiyu.com/api/auth/callback/google`
2. クライアント ID とシークレットで、シークレットの値を上書きする

    ```bash
    aws secretsmanager put-secret-value \
        --secret-id nagiyu-auth-google-oauth-{env} \
        --secret-string '{"clientId":"<クライアント ID>","clientSecret":"<クライアントシークレット>"}' \
        --region us-east-1 --profile nagiyu-{env}
    ```

3. Auth を再デプロイする ([Auth を再デプロイする](#auth-を再デプロイする))。値はデプロイのときに環境変数へ入るので、上書きしただけでは Lambda に届かない
4. 確かめる。dev で、人が Google でログインする。実際の Google アカウントが要るので、CI には置かない。失敗したら、Google Cloud Console のリダイレクト URI がシークレットの環境の URI と一致しているかと、再デプロイを忘れていないか (Lambda の `GOOGLE_CLIENT_ID` が仮の値のままではないか) を見る

### Stripe の鍵を設定する

Stripe の画面で用意するもの (価格・Customer Portal・通知の受け口) は [Stripe](./stripe.md)。ここでは、鍵をシークレットに入れて反映する手順だけを書く。

1. Stripe の管理画面で、秘密鍵と、通知の受け口の署名鍵を用意する。dev はサンドボックスの鍵を使う。prod の秘密鍵は、権限が「重要な操作を除くフルアクセス」の制限付きキー (`rk_live_` で始まる) でよい。そのまま秘密鍵として入れられる。Auth が使うのは顧客・価格・決済画面・Customer Portal・契約・予約の操作だけで、入金や資金の移動は使わないので、漏れたときにお金を動かされない。権限を細かく選んで足りずに本番で失敗するのを避けるため、除くのは重要な操作だけにする
2. シークレットの値を上書きする

    ```bash
    aws secretsmanager put-secret-value \
        --secret-id nagiyu-auth-stripe-{env} \
        --secret-string '{"secretKey":"<秘密鍵>","webhookSecret":"<署名鍵>"}' \
        --region us-east-1 --profile nagiyu-{env}
    ```

3. Auth を再デプロイする ([Auth を再デプロイする](#auth-を再デプロイする))。値はデプロイのときに環境変数へ入る
4. 確かめる。プランの画面が「準備中です」ではなく、価格を出す。出ないときは、再デプロイを忘れていないか、2 つの値がどちらも `PLACEHOLDER_` で始まらないか、Stripe に `lookup_key` を付けた価格があるかを見る

### シークレットを入れ替える

入れ替えの周期は決めない。漏れたとき、または理由があるときに行う。

| シークレット | 入れ替えの手順 | 影響 |
|---|---|---|
| Google OAuth のクライアントシークレット | Google Cloud Console で新しいシークレットを発行し、`put-secret-value` で上書きし、Auth を再デプロイする | 再デプロイが済むまで、Google ログインは古い値のまま |
| `AUTH_SECRET` | `put-secret-value` で新しいランダムな文字列に上書きし、`nagiyu-auth-nextauth-secret-{env}` を読むすべてのサービスを再デプロイする | すべてのセッションが無効になり、全員がログインし直す。再デプロイの順が前後する間、Auth とほかのサービスで鍵が食い違い、片方が発行した JWT をもう片方は復号できないので、ログイン済みでも未ログインとして扱われる |
| Stripe の鍵 | Stripe で新しい鍵を発行し、「Stripe の鍵を設定する」の手順で上書きし、Auth を再デプロイする | 再デプロイが済むまで、古い鍵のまま |
