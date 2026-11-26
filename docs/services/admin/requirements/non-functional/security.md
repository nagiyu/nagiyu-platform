---
sources: []
---

# セキュリティ

Admin 固有の保護の水準。Cookie の属性は[NextAuth の設定](../../../../platform/specs/lib/nextjs/auth-config.md)、XSS などは[セキュリティ](../../../../platform/rules/security.md)、ログインの構成は[認証](../../../../platform/rules/authentication.md)に従う。

## 要求水準

- SNS からの通知は、署名を検証してから処理する。検証できないもの、送信元が自己監視のトピック以外のものは受け付けない ([SNS 受信 API](../../specs/api/notify-sns.md))
- VAPID の秘密鍵は、サーバーだけが持つ。ブラウザへ渡すのは公開鍵だけ ([シークレット](../../specs/resource/secrets.md))
- 通知の購読の登録と解除は、`notifications:write` 権限を持つ利用者だけが行える ([アクセス制御](../functional/access-control.md))
- エラーの履歴の閲覧は、`errors:read` 権限を持つ利用者だけに許す ([アクセス制御](../functional/access-control.md))
- Admin は、ログインの JWT を検証するだけで、JWT もクッキーも発行しない ([サインイン](../functional/sign-in.md))

## やらないこと

なし
