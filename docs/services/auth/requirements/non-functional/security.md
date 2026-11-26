---
sources: []
---

# セキュリティ

課金まわりの保護の水準。全サービス共通の水準 (Cookie の属性、CSRF、XSS など) は書かず、規約に従う ([セキュリティ](../../../../platform/rules/security.md)、[認証](../../../../platform/rules/authentication.md))。

## 要求水準

- カード情報を Auth で受け取らない。入力は Stripe の決済画面と Customer Portal で行う
- Stripe からの通知は、署名を検証してから処理する。検証できないものは処理しない
- Stripe の秘密鍵と通知の署名鍵は、Secrets Manager で管理し、リポジトリに置かない ([シークレット](../../specs/resource/secrets.md))
- 申し込みと契約の管理は、ログイン中の本人の分だけを扱う。戻り先は nagiyu のサービスの URL に限る ([戻り先](../../specs/term/callback-url.md))
- 課金の権利の手動の変更と、Stripe の顧客の対応の解除は、`roles:assign` 権限を持つ管理者だけが行える
- 本人向けのユーザー情報では、課金の権利のメモと、権利を付けた管理者を返さない

## やらないこと

なし
