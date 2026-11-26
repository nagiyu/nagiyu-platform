---
sources:
  - infra/auth/lib/dynamodb-stack.ts
  - services/auth/core/src/mappers/user.mapper.ts
  - services/auth/core/src/repositories/dynamodb-user-repository.ts
  - services/auth/core/src/repositories/update-roles-and-grants.ts
  - services/auth/core/src/repositories/user-repository.ts
  - libs/common/src/auth/role-grants.ts
  - services/auth/web/src/lib/auth/auth.ts
sources_hash: 4205e1486efc293fbc3508639f414eac66a9291d0fcb86a22449b1fe948da489
---

# ユーザーテーブル

Auth が持つユーザーを保存する DynamoDB のテーブル。ユーザー 1 人が 1 項目で、Google アカウントとの対応、手動で付けたロール、[課金の権利](../term/role-grant.md)、Stripe の顧客 ID を持つ。Auth だけが読み書きし、ほかのサービスはこのテーブルを参照しない。

## テーブル

| 項目 | 内容 |
|---|---|
| 名前 | `nagiyu-auth-users-{env}` (`{env}` は `dev` か `prod`) |
| 課金 | オンデマンド |
| 暗号化 | AWS 管理のキー |
| バックアップ | ポイントインタイムリカバリを有効にする |
| 有効期限 (TTL) | なし |

| 環境 | スタックを削除したときのテーブル |
|---|---|
| dev | 削除する |
| prod | 残す |

- 名前は[実行環境](../resource/web-runtime.md)の環境変数 `DYNAMODB_TABLE_NAME` で渡す。リポジトリは、この環境変数が未設定なら dev のテーブル名を使う
- prod は、スタックを削除してもテーブルとデータが残る。テーブルの名前は固定なので、残ったテーブルがあるままスタックを作り直すと、名前が衝突して失敗する。dev は、スタックを削除するとデータも消える
- ユーザーの削除 ([ユーザー API](../api/users.md)) は、項目ごと消す。課金の権利と顧客 ID も一緒に消え、Stripe の契約には触れない

## キー設計

| 種類 | 属性 | 型 |
|---|---|---|
| パーティションキー | `userId` | 文字列 |
| ソートキー | なし | |

| インデックス | キー | 射影 | 用途 |
|---|---|---|---|
| `googleId-index` | パーティションキー `googleId` (ソートキーなし) | すべての属性 | Google のアカウント ID からユーザーを引く |

どの取得に使うか。

| 取得 | 方法 |
|---|---|
| ユーザー 1 件 (ユーザー ID から) | `userId` を指定した GetItem |
| ログイン・ロールの再取得のユーザー引き当て | `googleId-index` の Query (先頭の 1 件を採る) |
| ユーザーの一覧 | テーブル全体の Scan。続きはカーソルで渡す。1 ページの件数は呼び出し側が決める (API の既定と上限は[ユーザー API](../api/users.md)と[ページネーション](../../../../platform/specs/lib/nextjs/pagination.md)) |

- 1 テーブルにユーザーの項目だけを置く。`PK` / `SK` の形ではなく、複数の種類を混在させない (Single Table ではない)
- 使われていない項目がある。属性 `Type` は書くが、どの処理も読まない

## 項目

日時はエポックミリ秒の数値。表の「旧名」は、読むときに受け付ける旧形式の属性名。

| 項目 | 型 | 意味 |
|---|---|---|
| `userId` | 文字列 | ユーザーの ID。作成時に採番する UUID (接頭辞なし)。変えられない |
| `googleId` | 文字列 | Google アカウントの ID。`googleId-index` のキー。変えられない |
| `Type` | 文字列 | 常に `User` |
| `Email` | 文字列 | メールアドレス。作成時に保存し、以後のログインでは更新しない。旧名 `email` |
| `Name` | 文字列 | 表示名。ログインのたびに Google の値で更新する。旧名 `name` |
| `Picture` | 文字列 | 任意。画像の URL。ログインのたびに更新し、Google が返さなくなったら削除する。旧名 `picture` |
| `Roles` | 文字列のリスト | 手動で付けたロールの ID。新規ユーザーは空。旧名 `roles` |
| `RoleGrants` | マップのリスト | 任意。[課金の権利](../term/role-grant.md)。一度も付けていないユーザーは属性がない |
| `StripeCustomerId` | 文字列 | 任意。Stripe の顧客 ID |
| `CreatedAt` | 数値 | 作成の日時。変えられない。旧名 `createdAt` |
| `UpdatedAt` | 数値 | 書き込みのたびに更新する日時。楽観ロックの条件に使う。旧名 `updatedAt` |
| `LastLoginAt` | 数値 | 任意。最後のログインの日時。旧名 `lastLoginAt` |

- 保存する属性名は PascalCase にする。例外はテーブルと `googleId-index` のキー (`userId`・`googleId`) で、camelCase のまま据え置く ([データアクセスの規約](../../../../platform/rules/data-access.md))
- `RoleGrants` の各要素の属性は camelCase (`grantId`、`roleId`、`source`、`sourceRef`、`expiresAt`、`revokedAt`、`grantedBy`、`createdAt`、`updatedAt`)。意味は[課金の権利](../../../../platform/specs/lib/common/role-grants.md)にある。要素の `source` が出どころの定義 (`manual`、`stripe`) にない値のときは、そのユーザーの項目を読めない (`InvalidEntityDataError`)
- 旧形式 (旧名の属性、ISO 文字列やエポック秒の時刻) の項目も読める。読み方と、書くときに旧名を消す挙動は[Item の読み取り](../../../../platform/specs/lib/aws/item-readers.md)と[EntityStore](../../../../platform/specs/lib/aws/entity-store.md)にある
- 読めない項目があると、そのユーザーを引く処理は失敗する。一覧は 1 ページ分をまとめて変換するので、読めないユーザーが 1 人いるとそのページ全体が失敗する

## 理由

- 課金の権利と Stripe の顧客 ID は、別のテーブルにせず、ユーザーの項目の属性に持つ。
    - 有効なロールの算出は、ログインとロールの再取得のたびに走る。そのとき読むユーザーの項目 1 件に入っているので、読み取りが増えない
    - ソートキーがないので、同じキーで別の種類の項目を並べられない。並べると、テーブル全体を読んでユーザーとして解釈する一覧が壊れる
    - ユーザーを削除すると、権利と顧客 ID も一緒に消える
    - dev では develop の版と integration の版が後勝ちで上書きし合う。更新は変えた属性だけを書くので、知らない属性を持つ項目を古い版が更新しても、その属性は消えない
- Stripe の顧客 ID の GSI は作らない。通知から顧客 ID を受け取ったら、Stripe の顧客の `metadata.userId` からユーザーを引き、そのユーザーの `StripeCustomerId` が通知の顧客 ID と一致するかを確かめる。代わりに、同期のたびに Stripe の顧客の取得が 1 回増える。同期は毎回 Stripe に問い合わせるので、増えるのはその 1 回だけで、テーブルの定義を変えずに済む
- 権利を書き換えるときは、読んだときの `UpdatedAt` を条件にして書く (楽観ロック)。競合したら読み直して、計算からやり直す。試行は初回を含めて 3 回で、解けなければ競合として返す。やり直しの読み取りは、強い整合性にしない。競合は同じユーザーへの書き込みがミリ秒単位で重なったときだけ起き、失敗しても変更は失われない。管理者は再読み込みして保存し直せばよく、Stripe の通知は再送される
- Stripe との同期の書き込みも、読んだ `UpdatedAt` を条件にする。Stripe を読む前に読む理由と、競合したときのやり直しは[契約がロールになる経路](../flow/billing-entitlement.md)にある
- 旧形式の項目は `UpdatedAt` が数値で保存されておらず、[EntityStore の楽観ロック](../../../../platform/specs/lib/aws/entity-store.md)で条件が一致しない。競合したら、中身を変えずに `UpdatedAt` だけを今の形で書き直してから読み直す。直さないと、読み直しても競合し続ける
- 課金の権利の読み取りは厳格にし、知らない出どころの権利があるユーザーは読めないようにする。読み飛ばすと、その版でユーザーを書き換えたときに、読めなかった権利が黙って消える。代わりに、読めない版ではそのユーザーを扱えなくなる。そのため、出どころを足すときは、読める版を先に出してから、書く版を出す (下の「手順」)
- キー属性を camelCase に据え置くのは、テーブルを作り直さないと名前を変えられないため ([データアクセスの規約](../../../../platform/rules/data-access.md))

## 手順

### 初期管理者を登録する

最初の管理者は、ロールを持たないと管理画面を開けないので、DynamoDB のテーブルへ直接書く。`{env}` は `dev` か `prod`。

1. 管理者にするアカウントで、Auth に一度ログインする。`Roles` が空のユーザーが作られる
2. ユーザーの `userId` を調べる。メールアドレスで Scan する (古い項目は属性名が小文字の `email` のことがあるので、両方を条件にする)

    ```bash
    aws dynamodb scan \
        --table-name nagiyu-auth-users-{env} \
        --filter-expression "Email = :e OR email = :e" \
        --expression-attribute-values '{":e":{"S":"<メールアドレス>"}}' \
        --query 'Items[].userId.S' \
        --region us-east-1 --profile nagiyu-{env}
    ```

    Google のアカウント ID が分かるなら、`googleId-index` に `aws dynamodb query --index-name googleId-index` で引いてもよい
3. `Roles` を `["admin"]` にする。`ROLES` は DynamoDB の予約語なので、属性名はプレースホルダーで渡す。`--condition-expression` で項目の存在を条件にするのは、`userId` の打ち間違いで、必須の属性がない読めない項目ができ、一覧がそのページごと失敗するのを防ぐため。小文字の `roles` に書いても効かない。読むときは `Roles` を先に見て、あればそれを採るので、`Roles` が空のリストでも小文字の属性は無視される

    ```bash
    aws dynamodb update-item \
        --table-name nagiyu-auth-users-{env} \
        --key '{"userId":{"S":"<userId>"}}' \
        --update-expression "SET #r = :r" \
        --condition-expression "attribute_exists(userId)" \
        --expression-attribute-names '{"#r":"Roles"}' \
        --expression-attribute-values '{":r":{"L":[{"S":"admin"}]}}' \
        --region us-east-1 --profile nagiyu-{env}
    ```

4. 反映させる。セッションのロールは、Auth がセッションを読むときに前回の取得から 5 分を過ぎていれば取り直す。待たずに反映するには、Auth の `/refresh` を開くか、ログインし直す
5. 確かめる。そのアカウントで `/dashboard/users` が開き、ユーザーの一覧が出る

- `RoleGrants` には触らない。課金の権利と手動で付ける権利は、管理画面から付ける

### 課金の権利の出どころを足す

出どころの定義は、`@nagiyu/common` の `ROLE_GRANT_SOURCES` ([課金の権利](../../../../platform/specs/lib/common/role-grants.md))。知らない出どころの権利を読めない版が動いている間に、その出どころの権利を書くと、その版はそのユーザーを扱えなくなる。次の順に出す。

1. 出どころの定義に足すだけの版を出す。その出どころで書くコードは入れない
2. 1 の版を、dev と prod の両方に出す
3. その出どころで書く版を出す

dev は、版が行き来する (後勝ちで上書きする) ので、1 の版を載せてから 3 の版を載せる。
