---
sources: []
---

# サインイン

Auth の SSO に任せ、Auth でログイン済みの管理者が、再ログインなしで Admin を使えるようにする。ユースケースは[Auth でログイン済みの管理者が Admin を使う](../use-cases/sign-in.md)。

## 要件

- Auth でログイン済みの管理者が、Admin で再ログインせずに使える。ログインの仕組みは Auth の[サインイン](../../../auth/requirements/functional/sign-in.md)にある
- Admin は、Auth が発行したログインの JWT を検証するだけで、JWT もクッキーも発行しない ([認証の規約](../../../../platform/rules/authentication.md))
- ログインしていない利用者が画面を開いたときは、Auth のサインインへ送る。ログイン後は元の画面へ戻る ([システム系の API](../../specs/api/system.md))
- Auth が止まっているときは、新しくログインできない。Admin 自身は専用のログインを持たないため、Auth の停止中は Admin も使えない

## やらないこと

- **Admin 専用のログインの提供**: ログインは Auth に集約し、各サービスにログインを作らせないため ([認証の規約](../../../../platform/rules/authentication.md))
