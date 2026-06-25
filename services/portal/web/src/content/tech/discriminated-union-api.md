---
title: 'TypeScript の discriminated union で API レスポンスを安全に扱う'
description: 'TypeScript の discriminated union（判別可能な共用体）を使って、API のレスポンス・状態管理・エラー型を網羅的かつ型安全に扱う方法を解説。switch の網羅性チェック・Zod との連携・実務で効くパターンを整理します。'
slug: 'discriminated-union-api'
publishedAt: '2026-03-30'
updatedAt: '2026-06-22'
author: 'なぎゆー'
tags: ['TypeScript', '型設計', 'union types']
categories: ['dev-stack']
---

## はじめに

API のレスポンスや UI 状態を扱うとき、「成功 / 失敗 / ローディング」のように **互いに排他なケース** を表現したい場面が頻発します。普通のオブジェクト型で表現すると不要なフィールドが optional だらけになり、`if` の分岐が散らばります。discriminated union を使うと、**判別フィールド**で分岐したときに TypeScript が中身を完全に絞り込んでくれます。

## 基本：判別フィールドで型を絞る

```typescript
type FetchResult<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

function render<T>(result: FetchResult<T>) {
  switch (result.status) {
    case 'idle':
      return 'アイドル';
    case 'loading':
      return '読み込み中…';
    case 'success':
      return `成功: ${result.data}`; // ← data が確実にある
    case 'error':
      return `エラー: ${result.message}`; // ← message が確実にある
  }
}
```

`result.status` の値ごとに、TypeScript は **その分岐内で `result` の型を絞り込みます**。`success` の枝で `result.message` にアクセスすると型エラーになります。`data | undefined` を都度チェックする書き方とは雲泥の差です。

## API レスポンスを統一形式で表現する

サーバー側でも判別共用体を返すようにすると、クライアント側の処理が機械的になります。

```typescript
// 共通の API 応答型
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

type ErrorCode = 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION_FAILED' | 'INTERNAL';
```

クライアント側の利用例:

```typescript
async function fetchUser(id: string): Promise<ApiResponse<User>> {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}

const result = await fetchUser('xxx');
if (!result.ok) {
  if (result.error.code === 'NOT_FOUND') return notFound();
  return showError(result.error.message);
}
// この行以降、result.data は User として確定している
const user = result.data;
```

`if (!result.ok)` の早期 return で、それ以降のスコープに `data` が必ずある状態を作れます。

## 網羅性チェックの徹底

新しい case を追加したのに switch 文の更新を忘れる、というバグを防ぐため、`never` 型でデフォルトケースをガードします。

```typescript
function assertNever(x: never): never {
  throw new Error(`Unexpected: ${JSON.stringify(x)}`);
}

function render<T>(result: FetchResult<T>) {
  switch (result.status) {
    case 'idle':
      return 'アイドル';
    case 'loading':
      return '読み込み中';
    case 'success':
      return `成功: ${result.data}`;
    case 'error':
      return `エラー: ${result.message}`;
    default:
      return assertNever(result); // 新ケース追加時にコンパイルエラー
  }
}
```

`FetchResult` に `cancelled` のような新ケースを追加すると、switch のどこかで網羅できていない箇所が即座に型エラーで判明します。

## Zod とのコンビネーション

Zod でも discriminated union を組めます。`discriminatedUnion` を使うと、判別フィールドの値を見て **適切なスキーマだけを実行**するので速いです。

```typescript
import { z } from 'zod';

const Event = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user_created'),
    userId: z.string().uuid(),
    email: z.string().email(),
  }),
  z.object({
    type: z.literal('order_placed'),
    orderId: z.string(),
    amount: z.number(),
  }),
  z.object({
    type: z.literal('user_deleted'),
    userId: z.string().uuid(),
  }),
]);

type Event = z.infer<typeof Event>;
```

EventBridge / SQS のメッセージのように、複数イベントが同じトピックに流れてくるシステムで威力を発揮します。

## 状態マシンの素朴な表現

UI の状態管理にも応用できます。たとえばフォーム送信フローは:

```typescript
type SubmitState =
  | { phase: 'editing'; values: FormValues; errors: Record<string, string> }
  | { phase: 'submitting'; values: FormValues }
  | { phase: 'submitted'; result: SubmitResult }
  | { phase: 'failed'; values: FormValues; reason: string };
```

`phase` ごとに **必要なフィールドだけ持つ**ので、`if (state.phase === 'submitted')` の枝で `state.values` を参照できないことが型で保証されます。XState のような状態マシンライブラリを入れる前段の選択肢として軽量です。

## 配列ユニオンで「オブジェクト集約」を表現する

たとえば「通知」が複数種類あるとき:

```typescript
type Notification =
  | { kind: 'info'; message: string }
  | { kind: 'warning'; message: string; severity: 'low' | 'high' }
  | { kind: 'error'; message: string; stack?: string };

function format(n: Notification): string {
  switch (n.kind) {
    case 'info':
      return `ℹ ${n.message}`;
    case 'warning':
      return `⚠[${n.severity}] ${n.message}`;
    case 'error':
      return `✕ ${n.message}${n.stack ? '\n' + n.stack : ''}`;
  }
}
```

各種別ごとに必要な情報が違うときに `optional` を増やすのではなく、構造を分ける方針が綺麗です。

## 実装ノート

ここまで汎用的なパターンを並べてきたが、自分が個人開発で運用しているサービスでは、コンテンツ型に対してあえて「各バリアントで形が変わる完全な判別ユニオン」までは持ち込んでいない。各種ドキュメントの種別は `src/types/content.ts` で `type: 'overview' | 'guide' | 'faq'` というリテラルユニオンとして定義しているだけだ。`ServiceDocument` は種別ごとの形状差がほとんどなく、共通フィールド + 本文という素直な構造なので、私の感覚では判別ユニオンに分解するより 1 つの型に literal の `type` を持たせるほうが扱いやすかった。

代わりに網羅性は `Record` で担保している。`lib/content.ts` の `TYPE_TO_FILENAME: Record<'overview' | 'guide' | 'faq', string>` が種別ごとの Markdown ファイル名を引くテーブルで、ここに種別を 1 つ増やすとキー不足で即コンパイルエラーになる。本文で紹介した switch + `never` と同じ「追加漏れを型で検出する」効果を、自分の実運用では Record の網羅キーで得ている、という割り切りだ。形状差が出てきたら、そのときこそ本記事の判別ユニオンに作り替える、と自分の中で線引きしている。

## ハマったポイント

discriminated union を実務で使ってきて、自分が特に踏みやすかった落とし穴を挙げておく。

- **判別フィールドが文字列リテラルでないと絞れない**: `kind: string` ではダメで、`kind: 'info' | 'warning'` のようなリテラル型が必要。私も最初に `type: string` のまま書いて絞り込みが効かず、しばらく原因に気付けなかった。
- **判別フィールドの命名がバラバラ**: `type`, `kind`, `status`, `phase` など複数種類混在しがち。自分の実運用ではコンテンツ種別を `type` に寄せて、レビュー時に迷わないようにしている。
- **`{}` と空オブジェクトの落とし穴**: `{}` は any っぽく見えるが TypeScript では「null・undefined 以外」を意味する。判別共用体に混ぜないように。
- **判別共用体の serialize**: JSON にしてから戻すと判別フィールドは残るので問題ないが、`Date` のような非 JSON 型を含めると往復で型がずれる。
- **`as` キャストに頼らない**: discriminated union を使うなら、絞り込みは `if` / `switch` で型ガードすること。`as` で逃げると型安全のメリットが消える。

## まとめ

discriminated union は、「ありえる状態」の集合を **構造ごと**型に書き起こせる強力な道具です。API レスポンス・UI 状態・イベント駆動の設計に取り入れると、optional 地獄から脱出して、TypeScript の型推論を最大限享受できます。
