# Scripts

このディレクトリには、niconico-mylist-assistant の運用・管理に必要なスクリプトが格納されています。

## generate-vapid-keys.js

Web Push 通知機能に必要な VAPID (Voluntary Application Server Identification) キーペアを生成します。

### 使用方法

```bash
node scripts/generate-vapid-keys.js
```

### 出力例

```
=== VAPID キーが生成されました ===

以下の環境変数を設定してください:

VAPID_PUBLIC_KEY=BG...
VAPID_PRIVATE_KEY=ab...

注意:
- 秘密鍵は厳重に管理してください
- 本番環境と開発環境で異なるキーを使用してください
- キーは AWS Systems Manager Parameter Store や Secrets Manager に保存することを推奨します
```

### 環境設定

生成されたキーは、以下の方法で設定します:

#### 開発環境

`.env.local` ファイルに追加:

```bash
VAPID_PUBLIC_KEY=<公開鍵>
VAPID_PRIVATE_KEY=<秘密鍵>
```

#### 本番環境

AWS Secrets Manager に保存し、CDK で環境変数として設定します。

詳細は [deployment.md](../tasks/niconico-mylist-assistant/deployment.md#33-vapid-キーの生成と設定) を参照してください。

## 注意事項

- **秘密鍵は絶対にリポジトリにコミットしないでください**
- 環境ごとに異なるキーペアを使用してください
- キーを紛失すると、全ユーザーの通知サブスクリプションが無効になります
