---
sources:
  - libs/aws/src/dynamodb/mapper/entity-mapper.interface.ts
  - libs/aws/src/dynamodb/mapper/patch-values.ts
sources_hash: 3db01db60884c9669241659b114a373d9d15f2dac873709e8f2ad5461eb2cad7
---

# EntityMapper

Entity と DynamoDB の Item の相互変換を担う型 `EntityMapper` と、update の変更 (patch) の値を変換する補助関数。変換はすべて mapper に置き、CRUD の骨格は [EntityStore](./entity-store.md) が受け持つ。`@nagiyu/aws` から import する。

## 使い方

### EntityMapper

`EntityMapper<TEntity, TKey>` を実装して、`EntityStore` に渡す。

| メンバー | 内容 |
|---|---|
| `entityType` | `Type` 属性の値。エラーメッセージにも使う |
| `legacyAttributeNames` (省略可) | 新属性名から旧属性名の一覧への対応。更新で新名を書くとき、旧名を同時に削除するために使う |
| `buildKeys(key)` | ビジネスキーから、DynamoDB の `Key` を作る |
| `getKey(entity)` | Entity からビジネスキーを取り出す |
| `toItem(entity)` | キー・`Type`・タイムスタンプを含む完全な Item にする |
| `toUpdateAttributes(changes, key)` | patch を、保存用の属性名と形式に変換する |
| `toEntity(item)` | Item を検証して Entity にする。旧形式も受け付ける |

関連する型は次のとおり。

| 型 | 内容 |
|---|---|
| `DynamoDBKey` | `Record<string, string \| number>`。DynamoDB の `Key` にそのまま渡せる |
| `DynamoDBAttributes` | `Record<string, unknown>`。Item 全体 |
| `EntityPatch<TEntity>` | Entity の各フィールドを省略可にし、`null` も許した型 |

### patch の値の補助関数

| 関数 | 引数 | 戻り値と失敗 |
|---|---|---|
| `requiredPatchValue` | `value`、`attributeName` | 必須項目の値。`null` なら `InvalidEntityDataError`。`undefined` はそのまま返す |
| `optionalPatchValue` | `value` | 任意項目の値。`null` は `REMOVE_ATTRIBUTE` にする。`undefined` はそのまま返す |
| `immutablePatchValue` | `value`、`attributeName` | 作成後に変えられない項目の検査。`undefined` 以外 (`null` を含む) なら `InvalidEntityDataError`。常に `undefined` を返す |

`attributeName` は、エラーメッセージに出す項目名。エラーメッセージは次のとおり。

| 関数 | メッセージ |
|---|---|
| `requiredPatchValue` | `必須項目は削除できません: {attributeName}` |
| `immutablePatchValue` | `作成後に変更できない項目です: {attributeName}` |

どちらも、`InvalidEntityDataError` の接頭辞 (`エンティティデータが無効です: `) が付く。

```ts
public toUpdateAttributes(changes: EntityPatch<User>, key: UserKey): DynamoDBAttributes {
  return {
    Name: requiredPatchValue(changes.name, 'Name'),
    Nickname: optionalPatchValue(changes.nickname),
    UserID: immutablePatchValue(changes.userId, 'UserID'),
  };
}
```

## 振る舞い

### キー

- `buildKeys` の戻り値は、`Key` にそのまま渡せる形にする。Single Table なら `{ PK, SK }`、単一キーのテーブルならそのキー属性 (例: `{ userId }`)
- キー属性の並びに意味がある。先頭をパーティションキー、2 番目以降をソートキーとして扱う。`EntityStore` は、存在判定 (`attribute_exists`、`attribute_not_exists`) に先頭の属性名を使う
- `toItem` は、`buildKeys` の結果と同じキー属性と値を含める。食い違うと、`EntityStore` が書き込みを拒否する

### patch

| 値 | 意味 |
|---|---|
| `undefined` | 変更しない。`toUpdateAttributes` の結果に含めない (含めても `EntityStore` が捨てる) |
| `null` | 属性を削除する。`toUpdateAttributes` では `REMOVE_ATTRIBUTE` にする |
| それ以外 | 新しい値 |

- `toUpdateAttributes` は、ミリ秒から TTL の秒への換算や、GSI の属性の付け直しなど、保存形式への変換もここで行う
- `key` は更新対象のビジネスキー。キーから作る属性 (GSI のキーなど) を付け直すために使う。patch にキーを混ぜなくても、更新で GSI の属性が保たれる。キーを使わない mapper は、第 2 引数を省略して実装してよい
- キー属性そのもの (`buildKeys` の結果) は返さない。含めると `EntityStore` が `InvalidEntityDataError` にする。`UpdatedAt` は `EntityStore` が管理するので、含めても無視される

### `toEntity`

- 旧形式の Item (旧属性名、ISO 文字列の時刻、エポック秒の時刻) も受け付ける。読み取りの補助は [Item の読み取り](./item-readers.md) にある
- 読めない Item は `InvalidEntityDataError` にする

## 理由

- 変換を mapper に一本化する。Entity と Item の変換、キーの組み立て、保存形式への変換が分散すると、保存形式を変えたときに直し漏れが出るため。DynamoDB 版と InMemory 版が同じ mapper を共有でき、変換がずれない
- `buildKeys` を `Key` の形にする。キーを `PK` と `SK` に決め打ちすると、単一キーのテーブルが標準から外れるため。テーブル設計の違いを mapper の中に閉じ込めれば、`EntityStore` はキーの形を知らずに済む
- patch は Entity の形 (camelCase) で受け取り、保存用の属性名への変換を mapper が担う。呼び出し側に属性名を書かせると、打ち間違いが黙って新しい属性を作り、ミリ秒と秒の取り違えも防げないため
- 必須項目の `null` を拒否する。黙って消すと、読み出しの検証に落ちる Item が残るため
- 作成後に変えられない項目を、値が同じでも拒否する。キーの値を写した属性や作成日時を変えると、キーと食い違う Item ができる。値が同じかどうかの判定を、呼び出し側に持ち込まないため
- patch の値の意味を 3 つの関数に集める。mapper ごとに書き写すと、実装がずれるため
- キーから作る属性は、`toUpdateAttributes` が受け取る `key` から組み立てる。patch に識別子を混ぜて渡させると、更新対象とは別の値を渡せてしまい、GSI の属性がキーと食い違うため
