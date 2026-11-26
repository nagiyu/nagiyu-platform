---
sources:
  - infra/livetalk/lib/secrets-stack.ts
  - infra/livetalk/lib/ecs-service-stack.ts
  - infra/livetalk/lib/batch-stack.ts
  - infra/livetalk/bin/livetalk.ts
  - infra/common/src/utils/secrets.ts
  - .github/workflows/livetalk-deploy.yml
sources_hash: dd44e0b544a3686f71cfc3299c6ab96b14d21519f3d5ff3e41cb3b00e99f95d3
---

# シークレット

OpenAI の API キーと、Web Push の VAPID 鍵を持つ Secrets Manager のシークレット。値は、Web ではタスクの起動のときに ECS が取り出して環境変数に入れ、バッチではデプロイのときにワークフローが読んで Lambda の環境変数に入れる。

## リソース

| 名前 | 種類 | 用途 | スタック |
|---|---|---|---|
| `/nagiyu/livetalk/{env}/openai/api-key` | Secrets Manager のシークレット | OpenAI の API キー ([OpenAI の使い方](./openai.md)) | `NagiyuLiveTalkSecrets{Env}` |
| `nagiyu-livetalk-vapid-{env}` | Secrets Manager のシークレット | Web Push の VAPID 鍵のペア | `NagiyuLiveTalkSecrets{Env}` |

`{env}` は `dev` か `prod`、`{Env}` は `Dev` か `Prod`。名前は `infra/common` の `SECRET_NAMES` が持つ。タグは `Application` が `nagiyu`、`Environment` が環境名、`ManagedBy` が `CDK`、`Component` が `livetalk`。

`AUTH_SECRET` は Auth が作るシークレットを読むだけで、LiveTalk では作らない ([Auth のシークレット](../../../auth/specs/resource/secrets.md)、[認証の規約](../../../../platform/rules/authentication.md))。

## 設定値

| シークレット | 値の形 | 作られたときの値 |
|---|---|---|
| OpenAI API キー | 文字列 (API キーそのもの。JSON ではない) | `PLACEHOLDER`。実際のキーで上書きする (下の「手順」) |
| VAPID | JSON `{"publicKey": "...", "privateKey": "..."}` | 公開鍵・秘密鍵とも `PLACEHOLDER`。実際の鍵で上書きする (下の「手順」) |

- 環境ごとに別の値を使う
- VAPID 鍵は、Web ([Web の実行環境](./web-runtime.md)) とバッチの通知 ([バッチの実行環境](./batch-runtime.md)) が同じ値を使う

## 環境変数

値を読む主体と、反映のされ方は、Web とバッチで違う。

| 読み手 | 読み方 | 環境変数 |
|---|---|---|
| Web (ECS のタスク) | コンテナの `secrets` (`valueFrom`)。タスクの起動のときに、タスク実行ロールが取り出す。タスク定義には ARN の参照だけが残る | `AUTH_SECRET`、`OPENAI_API_KEY`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` ([Web の実行環境](./web-runtime.md)) |
| バッチ (Lambda) | デプロイのワークフロー (`.github/workflows/livetalk-deploy.yml`) が Secrets Manager から読み、CDK の context で渡す。実行中の Lambda は Secrets Manager を読まない | `OPENAI_API_KEY` (通知・集約・取得)、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` (通知) ([バッチの実行環境](./batch-runtime.md)) |

バッチへ渡す値の対応。

| シークレットの値 | CDK の context | 環境変数 |
|---|---|---|
| OpenAI API キー | `openAiApiKey` | `OPENAI_API_KEY` |
| VAPID の `publicKey` | `vapidPublicKey` | `VAPID_PUBLIC_KEY` |
| VAPID の `privateKey` | `vapidPrivateKey` | `VAPID_PRIVATE_KEY` |

- context が渡されないときは、仮の値 (`PLACEHOLDER_OPENAI_API_KEY`、`PLACEHOLDER_VAPID_PUBLIC_KEY`、`PLACEHOLDER_VAPID_PRIVATE_KEY`) が入る
- Web の `AUTH_SECRET`、OpenAI API キー、VAPID は、デプロイの `infrastructure-app` ジョブの context では渡さない
- 値を変えたとき
    - Web: 動いているタスクには届かない。新しいタスクを起動すると反映される ([値を入れる・変える](#値を入れる変える))
    - バッチ: LiveTalk を再デプロイしないと、動いている Lambda に届かない

## 理由

- シークレットは、`NagiyuLiveTalkSecrets{Env}` で、仮の値で作り、実際の値は人が上書きする。Web の ECS のスタックは、シークレットを名前で取り込むだけで、作らない。作ると、人が入れた値を上書きしてしまう
- Web がシークレットを `secrets` で受けるのは、`environment` に平文を入れると、CloudFormation のテンプレートとタスク定義に値が残るため ([Web の実行環境](./web-runtime.md)の「理由」)

## 手順

AWS CLI は、環境ごとに `--profile nagiyu-dev` か `--profile nagiyu-prod` を付ける。

### LiveTalk を再デプロイする

バッチへ値を反映するために、`.github/workflows/livetalk-deploy.yml` を手動実行する。入力は `environment` (`dev` か `prod`)。手動実行は、`--ref` で指したブランチのコードをそのままデプロイするので、ブランチを必ず指定する。

| 環境 | `--ref` | 理由 |
|---|---|---|
| prod | `master` | 既定の `develop` から流すと、`develop` のまだリリースしていない資材が本番に出るため |
| dev | 今 dev に載っている資材のブランチ (dev へ最後にデプロイした run のブランチ。調べ方は下) | 既定の `develop` から流すと、`integration/**` の版が載っているときに、その版を上書きするため |

```bash
gh workflow run livetalk-deploy.yml --ref master -f environment=prod
gh workflow run livetalk-deploy.yml --ref <dev に載っているブランチ> -f environment=dev
```

dev に載っているブランチは、このワークフローの直近の run から調べる。`headBranch` が、最後にデプロイした run のブランチである。

```bash
gh run list --workflow livetalk-deploy.yml --limit 5 --json headBranch,event,conclusion,createdAt
```

このワークフローは、デプロイのたびに ECS のサービスも強制的に再デプロイする ([デプロイ先](../deploy.md))。そのため、再デプロイは Web とバッチの両方に値を届ける。

### 値を入れる・変える

1. シークレットの値を上書きする

    OpenAI API キー。

    ```bash
    aws secretsmanager put-secret-value \
        --secret-id /nagiyu/livetalk/{env}/openai/api-key \
        --secret-string '<API キー>' \
        --region us-east-1 --profile nagiyu-{env}
    ```

    VAPID 鍵。`{"publicKey":"...","privateKey":"..."}` の形で、鍵のペアは `web-push generate-vapid-keys --json` で作れる。

    ```bash
    aws secretsmanager put-secret-value \
        --secret-id nagiyu-livetalk-vapid-{env} \
        --secret-string '{"publicKey":"<公開鍵>","privateKey":"<秘密鍵>"}' \
        --region us-east-1 --profile nagiyu-{env}
    ```

2. 反映する

    | 読み手 | 反映の方法 |
    |---|---|
    | Web | LiveTalk を再デプロイする ([LiveTalk を再デプロイする](#livetalk-を再デプロイする))。バッチを変えずに Web だけ反映するときは、ECS のサービスを強制的に再デプロイする |
    | バッチ | LiveTalk を再デプロイする ([LiveTalk を再デプロイする](#livetalk-を再デプロイする)) |

    ```bash
    aws ecs update-service \
        --cluster nagiyu-shared-cluster-{env} \
        --service nagiyu-livetalk-service-{env} \
        --force-new-deployment \
        --region us-east-1 --profile nagiyu-{env}
    ```

3. 確かめる。Web は、新しいタスクが安定したあとに、チャットで応答が返ること。バッチは、次の実行が失敗せずに終わること
