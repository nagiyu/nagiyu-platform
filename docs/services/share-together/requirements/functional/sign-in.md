---
sources: []
---

# サインインと利用者の登録

Auth の SSO でログインした人が、再ログインなしで Share Together を使えるようにし、初めて使うときに利用者とデフォルトの個人リストを用意する。ログインの仕組みは Auth の[サインイン](../../../auth/requirements/functional/sign-in.md)にある。

## 要件

- Auth でログイン済みの利用者が、Share Together で再ログインせずに使える
- Share Together は、Auth が発行したログインの JWT を検証するだけで、ログインの仕組みを持たない ([認証の規約](../../../../platform/rules/authentication.md))
- ログインしていない人の扱いは[アクセス制御](../non-functional/access-control.md)にある
- 初めて使うときに、利用者として登録し、デフォルトの個人リストを 1 つ作る。登録の方法は[ユーザー API](../../specs/api/users.md)と[起動時の流れ](../../specs/flow/session-start.md)にある
- 登録済みの利用者は、登録のたびにメールアドレス・名前・画像をログインの内容で更新する。リストは増やさない
- 利用者として登録されると、メールアドレスでグループに招待される対象になる ([招待](invitation.md))

## やらないこと

- **Share Together 専用のログインの提供**: ログインは Auth に集約し、各サービスにログインを作らせないため ([認証の規約](../../../../platform/rules/authentication.md))
