---
sources: []
---

# データアクセスの規約

DynamoDB を使うサービスで、データアクセス層とテーブルを設計するときの規則と、その理由。部品の振る舞いは `docs/platform/specs/lib/aws/` の仕様にある。強制している設定ファイルはなく、レビューで守らせるため、出典は持たない。

## 抽象化の方針

### データアクセスはビジネスに近い名前の Repository で抽象化し、テストではインメモリ実装に差し替える

テストで本物の DynamoDB を使うと、テスト結果が実データの状態に左右され、ローカルで完結せず、遅くなり、同時に走る複数のテストが干渉する。そのため、DynamoDB 版と InMemory 版を同じ Repository のインターフェースの後ろに置く。

抽象化の高さは次の 3 つから選ぶ。

| 案 | 内容 | 採否 |
|---|---|---|
| 低レベル | DynamoDB の API を直接ラップする (`get(pk, sk)`、`query(gsi1pk)`) | 採らない。DynamoDB の詳細が呼び出し側に漏れ、抽象化にならない |
| 高レベル | DynamoDB に依存しない汎用のデータアクセス API | 採らない。GSI やページネーションなど DynamoDB の強みを活かせない |
| ハイブリッド | ビジネスキーでの CRUD (`getById(userId, tickerId)`) と、意味のある名前のクエリ (`getByUserId(userId, options)`) | 採る |

ページ位置は、実装の詳細を隠した不透明トークンの文字列で受け渡す。

### ページ位置は不透明トークンの文字列で受け渡し、Repository の外にキーを持ち出さない

キーのオブジェクトで受け渡すと、API 層と InMemory 実装の間で形式の変換が往復し、トークンにした意味がなくなる。トークンの仕様は [ページネーション](../specs/lib/aws/pagination.md) にある。

## テーブルの設計

### サービスごとに 1 つのテーブルを持ち、複数のエンティティを混在させる (Single Table)

PK / SK は `ENTITY#id` の形にする (例: `USER#123`)。GSI のキー属性は `GSI1PK` / `GSI1SK` のように番号つきで名付ける。テーブルのキー属性は `PK` / `SK` にする。InMemory 側でこの形を再現するのが [InMemorySingleTableStore](../specs/lib/aws/in-memory-single-table-store.md) である。

例外がある。

| サービス | テーブル | 理由 |
|---|---|---|
| auth | `userId` だけを主キーにする単一キー。GSI は `googleId` | キー属性の名前は、テーブルを作り直さないと変えられない |
| codec-converter | `jobId` だけを主キーにする単一キー | 同上 |

単一キーのテーブルも、InMemory では共通の InMemorySingleTableStore で扱う。

### TTL の属性名は `TTL` に揃える

テーブルごとに TTL の属性名を覚える必要をなくすため。TTL を使うテーブルは、すべて `TTL` を指定している。

## レイヤーの責務

```
[ビジネスロジック層]
        ↓
[Repository Interface]
        ↓
[DynamoDB 実装] [InMemory 実装]
        ↓
[EntityStore]     ← 単一アイテムの CRUD の骨格
        ↓
[Mapper]          ← Entity ↔ Item の変換 (両実装で同じもの)
        ↓
[DocumentClient] [InMemorySingleTableStore]
```

GSI を使う一覧などの独自のクエリは、各 Repository が DocumentClient / InMemorySingleTableStore に直接書き、変換だけ Mapper を使う。

| 部品 | 責務 | 仕様 |
|---|---|---|
| Entity | ビジネスロジックで扱うドメインオブジェクト。DynamoDB 固有の属性を持たない | |
| Mapper | Entity と Item の相互変換。キーの組み立て、Type と GSI 属性の付与、保存形式への変換、読み出し時の検証 | [EntityMapper](../specs/lib/aws/entity-mapper.md) |
| EntityStore | 単一アイテムの get / create / put / update / delete。条件付き書き込み、エラー変換、`UpdatedAt` の管理、旧属性名の削除 | [EntityStore](../specs/lib/aws/entity-store.md) |
| Repository Interface | ビジネスキーでの CRUD と、意味のある名前のクエリ。DynamoDB の詳細を含めない | |
| Repository 実装 | DynamoDB 版と InMemory 版。同じ Mapper と同じ EntityStore の振る舞いを使い、同じエラーを投げる | |
| InMemorySingleTableStore | Single Table をインメモリで再現する共通ストア | [InMemorySingleTableStore](../specs/lib/aws/in-memory-single-table-store.md) |

## 標準の書き方

### Entity に PK / SK・Type・GSI 属性を持たせない

ストレージの実装詳細をビジネスロジックから分離し、テストコードが DynamoDB の知識を必要としないようにするため。代わりに Mapper が必要になる。

### 変換は Mapper に一本化し、CRUD の骨格は合成で持つ

Entity と Item の変換はすべて Mapper が担う。単一アイテムの CRUD は、Mapper を受け取る EntityStore を Repository が持つ形 (合成) にし、基底クラスの継承は採らない。Mapper を使わずに Repository の中で直接変換する書き方もしない。

- Repository の多くは、単一アイテムの CRUD に加えて GSI のクエリ・トランザクション・バッチなどの独自の操作を持つ。継承だと基底クラスの都合と独自の操作がぶつかり、上書きが増える。
- 同じ Mapper を DynamoDB 版と InMemory 版で共有でき、変換のずれが起きない。
- キーの組み立てと変換が分散すると、保存形式を変えたときに直し漏れが出る。
- CRUD の骨格 (キーの組み立て → 書き込み → 条件失敗の変換 → Entity への変換) を各 Repository に書き写すと、条件付き書き込み・エラー変換・`UpdatedAt` の管理が Repository ごとにずれる。

web・batch・Lambda から DynamoDB を直接呼ぶ場合も、Repository を経由する。

### 存在判定の条件式は書かず、EntityStore に任せる

`attribute_not_exists(PK)` のように条件式を直書きすると、キー属性名が `PK` でないテーブルで誤る。

### 保存する属性名は PascalCase、Entity は camelCase にする

DynamoDB に保存する属性名は PascalCase にする (`UserID`、`CreatedAt`)。頭字語 (ID・URL など) は大文字のまま書く。Entity と API は camelCase にし、頭字語も先頭だけ大文字にする (`userId`)。名前の対応づけは Mapper が担う。

保存側は、キー属性 (`PK` / `SK` / `GSI1PK`) と並べたときに揃う PascalCase にする。頭字語を大文字のままにするのは、既に PascalCase で保存しているサービスの属性名 (`UserID`) を変えずに済ませるため。Entity と API は TypeScript のコードとして自然な camelCase にする。どちらか一方に寄せると、もう一方で慣習から外れた名前を書き続けることになる。

例外として、テーブルや GSI のキーになっている属性 (auth の `userId`・`googleId`、codec-converter の `jobId`) は camelCase のまま据え置く。キー属性の名前は、テーブルを作り直さないと変えられず、データのコピーと切り替えを伴う。

### 時刻は数値のミリ秒で保存し、TTL だけエポック秒にする

- 楽観ロックは `UpdatedAt` の一致で競合を検知するため、秒の精度では同じ秒の中の 2 回の書き込みを区別できない。メッセージの並びのように、同じ秒の中の順序が意味を持つデータもある。
- ISO 文字列は数値と比べて比較・計算に変換が要り、形式のゆれ (タイムゾーンの有無など) も起きる。
- TTL は DynamoDB がエポック秒でしか解釈しないため、ここだけが例外になる。

キーの中に埋め込まれた時刻や日付 (SK の一部になっている ISO 文字列や `DATE#2026-10-12` など) は対象外とする。キーの値はアイテムを作り直さないと変えられず、日付はソートキーとしての並びに意味がある。

### update は Entity の形で変更を受け取る

保存用の属性名ではなく、Entity の部分 (camelCase) を渡す。値が `undefined` の項目は変更せず、`null` の項目は属性を削除する。保存用の属性名・形式への変換は Mapper が担う。キー属性は update で変えられない。

呼び出し側に保存用の属性名を書かせると、属性名の打ち間違いが黙って新しい属性を作り、ミリ秒と秒の取り違えも防げない。変換を Mapper に集約する方針を update にも通す。update の変更の扱い (必須項目への `null`・作成後に変えられない項目・キーから作る属性) は全 Mapper で揃える。詳細は [EntityMapper](../specs/lib/aws/entity-mapper.md) にある。

### Repository のエラーは `RepositoryError` の派生で表す

素の `Error` や、メッセージ文字列で判定させる形は使わない。操作ごとの振る舞いは [EntityStore](../specs/lib/aws/entity-store.md) にある。

update は書き込んだあと、更新後のアイテムを Mapper で Entity に変換して返す。そのため、読めないアイテムに対する update は、書き込みが成功したあとで `InvalidEntityDataError` になる。呼び出し側はこのエラーを握りつぶさず、エラーとして扱う。壊れたアイテムの無効化などで、書き込みは済んでいても、読めないデータが残っていることを知らせるため。

同じ時刻を ID や有効期限にも使う呼び出しは、その値と揃えるため `createdAt` を明示して渡す。

## Repository の生成

### Repository はサービスの core に置いた生成の口から得る

各サービスの core に、`@nagiyu/aws` の `registerDynamoRepositories` で Repository を登録した生成の口 (`createXxxRepository()`) を置く。registry の `keyPrefix` にはサービス ID を付ける。web・batch・Lambda は DynamoDB 実装や InMemory 実装を直接 `new` せず、この口から得る。使い方は [Repository の registry](../specs/lib/aws/repository-registry.md) にある。

- `USE_IN_MEMORY_DB` による実装の切り替えと、共有ストアの受け渡しを 1 か所に集めるため。呼び出し側が DynamoDB 実装を直接 `new` すると、そのサービスは InMemory に切り替えられない。
- 生成の口を web に置くと、batch や Lambda から使えず、そちらで直接 `new` することになる。core なら web・batch・Lambda のどれからも同じ口を使える。
- `keyPrefix` は、Next.js の dev モードで module が分離されても、同じインスタンスを `globalThis` から引くために使う。

### InMemory 実装は、共通の InMemorySingleTableStore を共有する

Repository ごとに独立したストア (`Map` など) を持つと、Single Table が再現できず、Repository 間のデータの整合性も保証されない。共有すれば、GSI もシミュレートできる。ストアの初期化は共通化する必要がある。

## 新しいエンティティを足す手順

1. **Entity**: DynamoDB 固有の属性を含まない camelCase のビジネスオブジェクト。`createdAt` / `updatedAt` は数値ミリ秒で持つ。
2. **Mapper**: キーの組み立て、保存形式への変換 (PascalCase・ミリ秒・TTL の秒)、読み出し時の検証。保存形式を変えたときは旧属性名も宣言する。
    - `toUpdateAttributes` の patch の値は共通の変換関数で扱い、必須項目・任意項目・作成後に変えられない項目の扱いを Mapper ごとに書き写さない。
    - 任意の属性は、無ければ未設定 (または既定値)、あって不正なら `InvalidEntityDataError` とする共通の読み取りで読む。欠落と破損を区別するため。不正な値を欠落として黙って扱うと、壊れたデータに気づけない。
3. **Repository Interface**: ビジネスキーでの CRUD と、意味のある名前のクエリ。
4. **DynamoDB 実装と InMemory 実装**: 単一アイテムの CRUD は EntityStore に任せ、独自のクエリだけを書く。
5. **テスト**: Mapper の変換 (旧形式の読み取りを含む)、Repository、E2E の各層。

## 保存形式を変えるとき

### 既存データは一括で移行せず、次に書き込まれたときに新形式へ置き換える

Mapper は読むときに旧形式 (旧属性名・ISO 文字列・エポック秒) も受け付け、書くときは必ず新形式で書く。update で属性を書くときは、その属性の旧名を削除して二重に残さない。

一括移行はデータ量に比例して時間と事故のリスクが増え、環境ごとの実行と検証が要る。読み取りの互換処理を共通部品に置けば、旧形式は書き込みのたびに自然に置き換わる。

この方式から、次の規則が導かれる。

- **読み取りの互換処理を残し続ける**: 書き込まれないアイテムは旧形式のまま残る。
- **絞り込みと条件式は、新名と旧名の両方を見る**: Query や Scan の絞り込み (FilterExpression) は保存されている属性名に対して行われ、Mapper の互換は取り出したあとの変換にしか効かない。新名だけを条件にすると、旧形式のまま残ったアイテムが結果から漏れる。書き込みの条件 (ConditionExpression) で属性の有無を見るときも同じで、旧名も「設定済み」の判定に含める。新名だけを見ると、旧名に値が残ったアイテムを未設定と誤判定し、新名を書いたうえで旧名を削除して、既存の値を消してしまう。
- **形式を変える変更を本番へ出したあとは、前の版へ戻さずに前へ直す**: 新形式で書いたデータは、旧形式しか読めない古いコードでは読めない。
- **キー属性の名前や、キーに埋め込まれた値の形式は変えない**: 変えるにはアイテムやテーブルの作り直しが要る。

### TTL の属性名を変えるときは、2 段階に分けて切り替え、旧名の値を `TTL` に写す

TTL 属性は 1 テーブルに 1 つしか指定できず、旧名のまま残ったアイテムは期限が来ても削除されない。そのため、旧名の値を新しい TTL 属性へ写す作業を、一度だけ計画に含める。

テーブル定義の書き換え 1 回では名前を変えられない。次の制約があるため。

- CloudFormation は、TTL が有効なまま属性名を変える更新を拒否する。テーブルを手で無効化しても通らない (CloudFormation は実際の状態ではなく、前回のテンプレートと比べて判定する)。
- DynamoDB は、TTL の変更を約 1 時間に 1 回しか受け付けない。

手順は次のとおり。

1. 1 段目で、テーブル定義から TTL の指定を外して無効化する。
2. 無効化が終わって 1 時間たってから、2 段目で新しい名前を指定して有効化する。

本番には、2 つの段階を別のリリースで、1 時間以上あけて出す。本番の TTL は手で触らない。
