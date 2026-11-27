---
sources:
  - infra/quick-clip/lib/secrets-stack.ts
  - infra/quick-clip/lib/batch-stack.ts
  - infra/quick-clip/bin/quick-clip.ts
  - .github/workflows/quick-clip-deploy.yml
  - services/quick-clip/batch/src/lib/environment.ts
sources_hash: 1eb3514c2ef46e346b31e6b3d47f5b5ad4d021e40ca3121c4a654b7aa3bbd672
---

# シークレット

OpenAI の API キーを持つ Secrets Manager のシークレット。値は、デプロイのときに読まれ、Batch のジョブ定義の環境変数に入る。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-quick-clip-openai-api-key-{env}` | Secrets Manager のシークレット | OpenAI の API キー (文字起こしと感情分析に使う) |

`{env}` は `dev` か `prod`。スタックは `NagiyuQuickClipSecrets{Env}` ([デプロイ先](../deploy.md))。タグは `Application` が `nagiyu`、`Service` が `quick-clip`、`Environment` が環境名。

## 設定値

| 項目 | 値 |
|---|---|
| 値 | JSON `{"apiKey": "..."}` |
| 作られ方 | 仮の値 `PLACEHOLDER` で作られ、実際のキーで上書きする (下の「手順」) |
| 削除ポリシー | 指定しない (CloudFormation の既定) |

- コードは `PLACEHOLDER` を特別に扱わない。仮の値のまま、そのまま API キーとして Batch に渡る
- キーが空か空白だけのときは、キーがないものとして扱う ([バッチの実行環境](./batch-runtime.md)の環境変数 `OPENAI_API_KEY`)

## 環境変数

シークレットの値は、デプロイのワークフロー (`.github/workflows/quick-clip-deploy.yml`) が Secrets Manager から読み、CDK の context で渡す。実行中のコンテナは Secrets Manager を読まない。

| シークレットの値 | CDK の context | 環境変数 |
|---|---|---|
| `apiKey` | `openAiApiKey` | `OPENAI_API_KEY` (Batch の 3 つのジョブ定義。[バッチの実行環境](./batch-runtime.md)) |

- ワークフローは、シークレットの JSON を展開して環境変数に置く。`apiKey` は `OPENAI_API_KEY_APIKEY` になる
- 値を変えたら、Quick Clip を再デプロイしないと、ジョブ定義に届かない
- 再デプロイのあとに投入するジョブから、新しい値になる。投入はジョブ定義の版を指定しないので、最新の版が使われる。再デプロイの前に投入したジョブは、古い値のまま動く

## 権限

どのロールも、このシークレットを読む権限を持たない ([バッチの実行環境](./batch-runtime.md)、[Web の実行環境](./web-runtime.md))。読むのはデプロイのワークフローだけ。

## AUTH_SECRET

ログインの JWT を検証する `AUTH_SECRET` は、Auth が作るシークレットを読むだけで、Quick Clip では作らない。値と作られ方は [Auth のシークレット](../../../auth/specs/resource/secrets.md)にある。デプロイのワークフローが `nagiyu-auth-nextauth-secret-{env}` を読み、CDK の context `nextAuthSecret` で Web に渡す ([Web の実行環境](./web-runtime.md))。

## 理由

- API キーを環境変数で渡す作りなので、ジョブロールに Secrets Manager の権限は要らない。代わりに、値がジョブ定義に平文で残る
- シークレットのスタックを ECR のスタックと同じジョブで先にデプロイするのは、アプリのスタックのデプロイが、シークレットの値を読むため

## 手順

AWS CLI は、環境ごとに `--profile nagiyu-dev` か `--profile nagiyu-prod` を付ける。

### OpenAI の API キーを設定する

初回のデプロイでは、シークレットが仮の値で作られる。実際のキーで上書きしてから、Quick Clip を再デプロイする。

1. OpenAI の管理画面で、API キーを発行する
2. シークレットの値を上書きする

    ```bash
    aws secretsmanager put-secret-value \
        --secret-id nagiyu-quick-clip-openai-api-key-{env} \
        --secret-string '{"apiKey":"<OpenAI の API キー>"}' \
        --region us-east-1 --profile nagiyu-{env}
    ```

3. Quick Clip を再デプロイする ([Quick Clip を再デプロイする](#quick-clip-を再デプロイする))。値はデプロイのときにジョブ定義へ入るので、上書きしただけでは Batch に届かない
4. 確かめる。ジョブ定義の最新の版が、再デプロイの前より増えていることを見る

    ```bash
    aws batch describe-job-definitions \
        --job-definition-name nagiyu-quick-clip-{env}-small --status ACTIVE \
        --query 'max_by(jobDefinitions, &revision).revision' \
        --region us-east-1 --profile nagiyu-{env}
    ```

    そのうえで dev で、AI 解析ありの動画を流し、進捗の文字起こしが終わることを見る。OpenAI の実際のキーが要るので、CI には置かない。ジョブ定義の環境変数には値が平文で残るため、確かめるときに表示しない

### Quick Clip を再デプロイする

値を環境変数へ反映するために、`.github/workflows/quick-clip-deploy.yml` を手動実行する。入力は `environment` (`dev` か `prod`)。手動実行は、`--ref` で指したブランチのコードをそのままデプロイするので、ブランチを必ず指定する。

| 環境 | `--ref` | 理由 |
|---|---|---|
| prod | `master` | 既定の `develop` から流すと、`develop` のまだリリースしていない資材が本番に出るため |
| dev | 今 dev に載っている資材のブランチ (dev へ最後にデプロイした run のブランチ) | 既定の `develop` から流すと、`integration/**` の版が載っているときに、その版を上書きするため |

```bash
gh workflow run quick-clip-deploy.yml --ref master -f environment=prod
gh workflow run quick-clip-deploy.yml --ref <dev に載っているブランチ> -f environment=dev
```

### シークレットを入れ替える

入れ替えの周期は決めない。漏れたとき、または理由があるときに行う。OpenAI の管理画面で新しいキーを発行し、「OpenAI の API キーを設定する」の手順で上書きして、再デプロイする。再デプロイが済むまで、Batch は古いキーのまま動く。古いキーは、OpenAI の管理画面で無効にする。
