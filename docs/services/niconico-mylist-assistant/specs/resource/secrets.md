---
sources:
  - infra/niconico-mylist-assistant/lib/secrets-stack.ts
  - infra/niconico-mylist-assistant/bin/niconico-mylist-assistant.ts
  - infra/niconico-mylist-assistant/lib/policies/web-runtime-policy.ts
  - infra/niconico-mylist-assistant/lib/policies/batch-runtime-policy.ts
  - .github/workflows/niconico-mylist-assistant-deploy.yml
sources_hash: c2602216853fe0d548d885c6de9f46232a001813dc54d45def7cea3d6655856b
---

# シークレット

ニコニコセッションの暗号化キーと、Web Push の VAPID キーを持つ Secrets Manager のシークレット。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-niconico-mylist-assistant-shared-secret-key-{env}` | Secrets Manager のシークレット | [ニコニコセッション](../term/user-session.md)の暗号化キー |
| `nagiyu-niconico-mylist-assistant-vapid-{env}` | Secrets Manager のシークレット | 完了通知 (Web Push) の VAPID キーペア |

`{env}` は `dev` か `prod`。タグは `Application` が `nagiyu`、`Service` が `niconico-mylist-assistant`、`Environment` が環境名。

## 設定値

| シークレット | 値 | 作られ方 |
|---|---|---|
| 暗号化キー | 32 文字のランダムな文字列 (除外する文字なし) | デプロイで自動生成する。手で作らない |
| VAPID キー | JSON `{"publicKey": "...", "privateKey": "..."}` | 仮の値 `PLACEHOLDER` (公開鍵・秘密鍵とも) で作られ、実際のキーで上書きする (下の「手順」) |

- 暗号化の方式と鍵の扱いは[暗号化](../../../../platform/specs/lib/aws/crypto.md)のとおり。シークレットの文字列は先頭の 32 バイトを鍵にするので、32 文字のランダムな文字列で足りる
- VAPID キーは、環境ごとに別のキーを使う

## 環境変数

シークレットの参照は、環境変数で受け渡す。

| 名前 | 渡す先 | 内容 |
|---|---|---|
| `ENCRYPTION_SECRET_NAME` | [Web](./web-runtime.md)、[バッチ](./batch-runtime.md) | 暗号化キーのシークレット名。実行時に Secrets Manager から読む |
| `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` | [Web](./web-runtime.md)、[バッチ](./batch-runtime.md) | VAPID キーの値。デプロイのときに、VAPID キーのシークレットから取り出して渡す。実行時には Secrets Manager を読まない |

## 権限

| 誰が | 許可する操作 |
|---|---|
| Web の実行ロール | 暗号化キーと VAPID キーのシークレットの `secretsmanager:GetSecretValue` |
| バッチのジョブロール | 同上 |

- VAPID キーのシークレットの読み取りを許可しているが、実行中のコードは VAPID キーを環境変数から読む ([Web Push](../../../../platform/specs/lib/common/web-push.md)の VAPID 設定)

## 手順

### VAPID キーを設定する

初回のデプロイでは、VAPID キーのシークレットが仮の値で作られる。実際のキーで上書きしてから、アプリケーションをデプロイし直す。

1. キーペアを生成する

    ```bash
    npx web-push generate-vapid-keys
    ```

2. シークレットの値を上書きする

    ```bash
    aws secretsmanager put-secret-value \
        --secret-id nagiyu-niconico-mylist-assistant-vapid-{env} \
        --secret-string '{"publicKey":"...","privateKey":"..."}' \
        --region us-east-1
    ```

3. アプリケーションをデプロイし直す。環境変数にはデプロイ時の値が入るため、上書きしただけでは Web とバッチに反映されない
