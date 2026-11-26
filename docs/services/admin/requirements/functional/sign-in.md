---
sources: []
---

# サインイン

Auth の SSO に任せ、Auth でログイン済みの運用者が、再ログインなしで Admin を使えるようにする。ユースケースは[Auth でログイン済みの運用者が Admin を使う](../use-cases/sign-in.md)。

## 要件

- Auth でログイン済みの運用者が、Admin で再ログインせずに使える。ログインの仕組みは Auth の[サインイン](../../../auth/requirements/functional/sign-in.md)にある
- Admin は、Auth が発行したログインの JWT を検証するだけで、JWT もクッキーも発行しない。ログインの状態を持つのは Auth だけにするため ([認証の規約](../../../../platform/rules/authentication.md))
- ログインしていない利用者が画面を開いたときは、Auth のサインインへ送る。ログイン後は元の画面へ戻る ([システム系の API](../../specs/api/system.md))
- Auth が止まっているときは、新しくログインできず、ログインの期限が切れたあとの再ログインもできない。Admin はログインの JWT を手元で検証するだけなので、有効な Cookie を持つ運用者は、期限が切れるまで使い続けられる

## やらないこと

- **Admin 専用のログインの提供**: ログインは Auth に集約し、各サービスにログインを作らせないため ([認証の規約](../../../../platform/rules/authentication.md))
