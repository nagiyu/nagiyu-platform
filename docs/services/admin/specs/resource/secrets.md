---
sources:
  - infra/admin/lib/secrets-stack.ts
  - infra/admin/lib/lambda-stack.ts
  - infra/admin/lib/batch-lambda-stack.ts
  - .github/workflows/admin-deploy.yml
  - services/admin/web/src/app/api/notify/vapid-key/route.ts
  - services/admin/core/src/notify/web-push-sender.ts
  - libs/common/src/push/client.ts
  - libs/common/src/push/config.ts
  - libs/browser/src/push.ts
  - services/admin/web/src/components/notify/NotifyButton.tsx
sources_hash: 776fe68e2c2b8f0a74d1cc1a4bfc68316d63b3fdc920e7a9a629b0e2014d3f67
---

# シークレット

Web Push の VAPID 鍵を持つ Secrets Manager のシークレット。値は、デプロイのときに読まれ、Web と stream-handler の Lambda の環境変数に入る。

## リソース

| 名前 | 種類 | 用途 | スタック |
|---|---|---|---|
| `nagiyu-admin-vapid-{env}` | Secrets Manager のシークレット | Web Push の VAPID 鍵のペア | `NagiyuAdminInfra{Env}` |

`{env}` は `dev` か `prod`、`{Env}` は `Dev` か `Prod`。タグは `Application` が `nagiyu`、`Service` が `admin`、`Environment` が環境名。

`AUTH_SECRET` は Auth が作るシークレットを読むだけで、Admin では作らない ([Auth のシークレット](../../../auth/specs/resource/secrets.md)、[認証の規約](../../../../platform/rules/authentication.md))。

## 設定値

| 項目 | 値 |
|---|---|
| 値の形 | JSON `{"publicKey": "...", "privateKey": "..."}` |
| 作られたときの値 | 公開鍵・秘密鍵とも `REPLACE_ME`。実際の鍵で上書きする (下の「手順」) |

- 環境ごとに別の鍵を使う
- Web と、バッチの stream-handler ([バッチの実行環境](./batch-runtime.md)) が、同じ鍵を使う。Web が返す公開鍵で作られた購読に、stream-handler が別の鍵で送ることになり、Push が届かなくなるため

## 環境変数

シークレットの値は、デプロイのワークフロー (`.github/workflows/admin-deploy.yml`) が Secrets Manager から読み、CDK の context で渡す。実行中の Lambda は Secrets Manager を読まない。

| シークレットの値 | CDK の context | 環境変数 |
|---|---|---|
| `publicKey` | `vapidPublicKey` | `VAPID_PUBLIC_KEY` ([Web](./web-runtime.md)、[stream-handler](./batch-runtime.md)) |
| `privateKey` | `vapidPrivateKey` | `VAPID_PRIVATE_KEY` ([Web](./web-runtime.md)、[stream-handler](./batch-runtime.md)) |

- context が渡されないときは、仮の値 `PLACEHOLDER` が入る
- 値を変えたら、Admin を再デプロイしないと動いている Lambda に届かない
- 公開鍵は、ブラウザが購読を作るときに要るので、Web が `/api/notify/vapid-key` で返す。秘密鍵は返さない

## 理由

- VAPID 鍵をシークレットに置くのは、秘密鍵をコードやリポジトリに置かないため。公開鍵はブラウザに渡すので隠す必要はないが、対になる鍵として同じシークレットで持つ。秘密鍵を持つのはサーバー (Web と stream-handler) だけで、ブラウザには出さない
- デプロイのワークフローは、`infrastructure` ジョブで先に Infra スタック (シークレットを含む) を作り、`deploy` ジョブがシークレットを読む。`deploy` ジョブが読む前にシークレットがあることを保証し、初回のデプロイで読み取りが失敗しないようにするため

## 手順

AWS CLI は、環境ごとに `--profile nagiyu-dev` か `--profile nagiyu-prod` を付ける。

### Admin を再デプロイする

値を環境変数へ反映するために、`.github/workflows/admin-deploy.yml` を手動実行する。入力は `environment` (`dev` か `prod`)。手動実行は、`--ref` で指したブランチのコードをそのままデプロイするので、ブランチを必ず指定する。

| 環境 | `--ref` | 理由 |
|---|---|---|
| prod | `master` | 既定の `develop` から流すと、`develop` のまだリリースしていない資材が本番に出るため |
| dev | 今 dev に載っている資材のブランチ (dev へ最後にデプロイした run のブランチ) | 既定の `develop` から流すと、`integration/**` の版が載っているときに、その版を上書きするため |

```bash
gh workflow run admin-deploy.yml --ref master -f environment=prod
gh workflow run admin-deploy.yml --ref <dev に載っているブランチ> -f environment=dev
```

### VAPID 鍵を入れる・作り直す

初回のデプロイでは、シークレットが `REPLACE_ME` で作られる。実際の鍵で上書きしてから、Admin を再デプロイする。

1. 鍵のペアを作る。Tools の VAPID キー生成画面 (`/vapid-generator`。ホストは[Tools のデプロイ先](../../../tools/specs/deploy.md)) で作る (`publicKey` と `privateKey` を返すので、そのままシークレットの値に使える)。コマンドで作るときは、`web-push` を `--json` 付きで使う。`{"publicKey":"...","privateKey":"..."}` の形で出るので、そのままシークレットの値に使える

    ```bash
    npx web-push generate-vapid-keys --json
    ```

2. シークレットの値を上書きする

    ```bash
    aws secretsmanager put-secret-value \
        --secret-id nagiyu-admin-vapid-{env} \
        --secret-string '{"publicKey":"<公開鍵>","privateKey":"<秘密鍵>"}' \
        --region us-east-1 --profile nagiyu-{env}
    ```

3. Admin を再デプロイする ([Admin を再デプロイする](#admin-を再デプロイする))。値はデプロイのときに環境変数へ入るので、上書きしただけでは Lambda に届かない
4. 確かめる。購読を作り直したブラウザで「通知を有効にする」を押し、エラーを 1 件起こして Push が届くことを見る。届かないときは、再デプロイを忘れていないか (Lambda の `VAPID_PUBLIC_KEY` が `REPLACE_ME` や `PLACEHOLDER` のままではないか) と、ブラウザの購読が古い鍵のままではないかを見る

鍵を作り直すときは、既存の購読の扱いに注意する。

- 購読はブラウザが公開鍵を指定して作る。送信が拒否された購読を無効と判定して消す条件は [Web Push](../../../../platform/specs/lib/common/web-push.md) にある。無効と判定されない失敗は購読を残し、警告ログに出す
- 鍵が合わない送信にどの応答が返るかは、Push サービスが決める。無効と判定される応答でなければ、古い購読は残ったまま、通知が届かない
- 「通知を有効にする」は、ブラウザに購読が残っていればそれを使い回し、新しい公開鍵では作り直さない。購読の解除を呼ぶ画面もない ([Push 購読の経路](../flow/push-subscription.md))。鍵を変えたあとに通知を受けたいブラウザは、ブラウザ側で購読を解除してから、「通知を有効にする」を押し直す
