---
sources: []
---

# アクセス制御

利用者が使える機能を、持っている権限で分ける。保有株式とアラートは利用者ごとに分け、ほかの利用者のものは読み書きできない。

## 要件

- 権限は、閲覧 (`stocks:read`)、自分のデータの書き込み (`stocks:write-own`)、マスタ管理 (`stocks:manage-data`) の 3 つに分ける。ロールは、`stock-viewer`、`stock-user`、`stock-admin` の 3 つで、上位のロールは下位の権限を含む。各権限でできることと、ロールとの対応は[権限とロール](../../specs/term/permission.md)にある
- 保有株式とアラートは、利用者ごとに分かれる。ほかの利用者のものは、読み書きできない
- 権限がない操作は、使えない。拒否のしかたは[API のエラー応答](../../specs/term/api-error.md)に、画面での見え方は各画面の仕様にある
- ロールと権限の定義は、コードで持つ ([ロールと権限](../../../../platform/specs/lib/common/roles-and-permissions.md))
- ログインは Auth に任せる。このサービスは、Auth が発行した認証情報を検証して、ロールから権限を判定する ([サインイン](../../../auth/requirements/functional/sign-in.md))

## やらないこと

- **ロールの付け外し**: このサービスでは行わない。理由は[目的](../purpose.md)の「扱わない範囲」を参照
