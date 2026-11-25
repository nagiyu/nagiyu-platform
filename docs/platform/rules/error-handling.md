---
sources: []
---

# エラー処理の規約

エラーのメッセージ、例外の種類、報告をどの層で行うかの規則と、その理由。強制している設定ファイルはなく、レビューで守らせるため、出典は持たない。入力の検証の流れは [バリデーションの規約](./validation.md) にある。

## メッセージ

### エラーのメッセージは、日本語で書く

```ts
// NG
throw new Error('Invalid input');

// OK
throw new Error(ERROR_MESSAGES.EMPTY_INPUT);
```

画面に出る文言を、利用者が読める言葉にそろえるためである。画面に出るかどうかで分けず、例外のメッセージ全般を日本語にする。

### メッセージは、`ERROR_MESSAGES` の定数オブジェクトにまとめ、`as const` を付ける

```ts
const ERROR_MESSAGES = {
    EMPTY_INPUT: '入力が空です',
    INVALID_FORMAT: 'フォーマットが不正です',
} as const;
```

- 文言を 1 か所に集めると、変更の影響が見え、テストで文言を照合しやすい。
- `as const` を付けて readonly にすると、意図しない書き換えをコンパイルが止め、値がリテラル型になる。
- 名前は、何が悪いかがわかるキーにする (`INVALID_PRICE`、`DYNAMODB_TABLE_NAME_REQUIRED` など)。
- libs で定数のオブジェクトを export するときは、ほかのモジュールの定数と取り違えないよう、モジュールの接頭辞を付ける (`COMMON_ERROR_MESSAGES`、`PAGINATION_ERROR_MESSAGES` など)。モジュール内だけで使うものは `ERROR_MESSAGES` でよい。services は、export するものも接頭辞なしの `ERROR_MESSAGES` にしている箇所が多く、この規則を課していない。

### 技術的な詳細より、対処方法を書く

```ts
// NG
throw new Error('JSON parse failed at line 5');

// OK
throw new Error('データの形式が正しくありません。正しい JSON 形式で入力してください');
```

利用者が次に何をすればよいかを、メッセージで伝えるためである。

## 例外の種類

### 呼び出し側の誤りと対象の不在は、例外のクラスで表し、受け手はクラスで振り分ける

- 呼び出し側が渡した値が規則に合わないときは `InvalidInputError` (`@nagiyu/common`)、対象が無いときは `EntityNotFoundError` (`@nagiyu/aws`) を投げる。使い方は [バリデーションの部品](../specs/lib/common/validation.md) と [リポジトリのエラー](../specs/lib/aws/repository-errors.md) にある。
- 受け手 (API ルートなど) は `instanceof` で 400 と 404 に振り分け、例外の文言で照合しない。
- 専用のコードで返し分けたい業務上のエラー (上限の超過など) は、汎用の 400 に吸われないよう、`InvalidInputError` にしない。投げる側が文言の定数を export し、受け手はその定数と照合する。文言の写しを受け手に持たせない。
- 例外として、quick-clip と share-together の route は、対象の不在 (`HIGHLIGHT_NOT_FOUND`、`INVITATION_NOT_FOUND`、`MEMBERSHIP_NOT_FOUND` など) も文言の定数と照合して 404 にしている。

```ts
// NG: 投げる側の文言を写して照合する
if (error instanceof Error && error.message === 'リスト ID は必須です') { /* 400 */ }

// OK: クラスで振り分ける
if (error instanceof InvalidInputError) { /* 400 */ }
if (error instanceof EntityNotFoundError) { /* 404 */ }
```

文言で照合すると、投げる側が文言を変えたとき、400 や 404 のはずの応答が黙って 500 になり、障害として報告される。部分一致で照合すると、同じ語を含む別の例外 (DynamoDB 由来のものなど) を、利用者の誤りと取り違える。

### 失敗は例外で表す。対象が無いことは失敗ではなく、`null` で返してよい

入力の誤りや外部の障害といった失敗は、例外にする。`null` で返すと、呼び出し側が「失敗」と「結果なし」を取り違える。

```ts
// NG: 失敗を null で返す
function calculateTargetPrice(price: number): number | null

// OK: 例外を投げる
function calculateTargetPrice(price: number): number {
    if (price < 0) throw new Error(ERROR_MESSAGES.INVALID_PRICE);
    return price * 1.2;
}
```

戻り値の型が単純なまま保たれ、Next.js の Error Boundary と相性がよい。失敗の扱いが、呼び出し側のコードに明示的に現れる。

一方、キーで引いた対象が無いことは失敗ではないので、`T | null` で返してよい (`EntityStore.get` や、それを包む Repository の取得がこの形である)。「必ずあるはず」の対象を呼び出し側が求めるときは、`EntityNotFoundError` を投げる。

## 報告

### エラーの報告は、例外を最後に受け止める層だけが行う

- Web API は、ルートの入口のラッパー (`createApiErrorReporting`) が報告する。Lambda と Batch は `withErrorReporting` が報告する。EventBridge の定期実行のハンドラー (stock-tracker・livetalk・dev-sync の batch) は、`createScheduledHandler` が報告する ([定期実行 Lambda の骨格](../specs/lib/aws/scheduled-handler.md))。core とリポジトリは報告せず、そのまま投げる。
- 例外を握りつぶして処理を続ける箇所は、上に届かないため、その場で報告する。報告には `createErrorReporter` を使い、報告の context の例外の項目を手書きしない。どの報告も同じ項目で調べられるようにするためである。

```ts
// NG: 報告して再度投げると、入口でも報告されて二重になる
try {
    await repository.save(item);
} catch (error) {
    await reportErrorEvent({ /* ... */ });
    throw error;
}

// OK: core は投げるだけ。入口のラッパーが 1 回だけ報告する
await repository.save(item);
```

例外は、呼び出し元をたどって最後の層に必ず届く。そこで報告すれば、漏れも重複もなくなる。途中の層が報告すると、同じ障害が複数件のエラーイベントになる。ラッパーと報告の部品の仕様は [API ルートのエラー報告](../specs/lib/nextjs/api-error-reporting.md) と [エラーの報告](../specs/lib/aws/error-reporting.md) にある。

## API リクエストのエラーの層

API リクエストのエラーは、リトライ、変換、表示の 3 つの層で処理する。層ごとに、1 つの部品が受け持つ。

| 層 | 受け持つこと | 仕様 |
|---|---|---|
| リトライ | ネットワークレベルのエラーの再試行とタイムアウト | [API クライアント](../specs/lib/common/api-client.md) |
| 変換 | HTTP ステータスとエラーコードを日本語のメッセージへ変える | [API クライアント](../specs/lib/common/api-client.md) |
| 表示 | 変換されたエラーを画面に出す | [useApiRequest](../specs/lib/react/use-api-request.md) |

サービスは、API のエラーコードに対応するメッセージを、サービスの側で定数のオブジェクトとして定義する。共通のコードとメッセージは [エラーコード](../specs/lib/common/error-codes.md) にある。
