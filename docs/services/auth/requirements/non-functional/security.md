---
sources: []
---

# セキュリティ

課金まわりの保護の水準。全サービス共通の水準は書かない。Cookie の属性は[NextAuth の設定](../../../../platform/specs/lib/nextjs/auth-config.md)、XSS などは[セキュリティ](../../../../platform/rules/security.md)、ログインの構成は[認証](../../../../platform/rules/authentication.md)に従う。

## 要求水準

- カード情報を Auth で受け取らない。入力は Stripe の決済画面と Customer Portal で行う
- Stripe からの通知は、署名を検証してから処理する。検証できないものは処理しない
- Stripe の秘密鍵と通知の署名鍵は、Secrets Manager で管理し、リポジトリに置かない ([シークレット](../../specs/resource/secrets.md))
- 申し込みと契約の管理は、ログイン中の本人の分だけを扱う。戻り先は nagiyu のサービスの URL に限る ([戻り先](../../specs/term/callback-url.md))
- 課金の権利の手動の変更と、Stripe の顧客の対応の解除は、`roles:assign` 権限を持つ管理者だけが行える
- 本人向けのユーザー情報では、課金の権利のメモと、権利を付けた管理者を返さない。メモは運営者が内部向けに書くことがあり、本人に見せる前提ではないため。返す項目の細かい単位は[ユーザー API](../../specs/api/users.md)に任せる

## やらないこと

なし
