---
title: 'zod でランタイムバリデーションと型を一元化する'
description: 'TypeScript の型は実行時には消える。外部から来る入力を信用しないために、zod でスキーマを単一の真実源にし、ランタイム検証と静的型を一元化する方法を、parse/safeParse の使い分けや API 境界での実践とともに整理します。'
slug: 'zod-schema-validation'
publishedAt: '2026-06-20'
author: 'なぎゆー'
tags: ['TypeScript', 'zod', 'バリデーション', '型設計']
categories: ['dev-stack']
---

## はじめに

TypeScript の型は **コンパイル時に消える**。`fetch` の戻り値を `as User` でキャストしても、サーバーが実際に返してきた JSON が `User` の形をしている保証はどこにもありません。クエリパラメータ・リクエストボディ・環境変数・外部 API のレスポンス——アプリケーションの境界を越えて入ってくる値は、すべて「型が付いているフリをした `unknown`」です。

この穴を埋めるのが **ランタイムバリデーション** です。そして zod を使うと、検証ロジックと TypeScript の型を **1 つのスキーマから両方**得られます。型定義とバリデーション関数を二重管理してずれていく、という典型的な事故を構造的に防げるのが最大の価値です。

## スキーマから型を導出する

zod の基本は「まずスキーマを書き、型はそこから導く」ことです。`type` を手で書いてから別途バリデータを書くのではなく、順序を逆にします。

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'guest']),
  createdAt: z.coerce.date(),
});

// スキーマから型を導出（手書きの type は不要）
type User = z.infer<typeof UserSchema>;
// {
//   id: string;
//   name: string;
//   email: string;
//   role: 'admin' | 'member' | 'guest';
//   createdAt: Date;
// }
```

`z.infer` が肝です。スキーマに `phone` フィールドを足せば `User` 型にも自動で増えます。**型とバリデーションが絶対にずれない**——これがスキーマファーストの効能です。

## parse と safeParse の使い分け

検証の入口は 2 つあります。挙動の違いがそのまま使いどころの違いです。

```typescript
// parse: 失敗すると ZodError を throw する
const user = UserSchema.parse(input); // 成功すれば input は User として確定

// safeParse: 例外を投げず、判別可能な結果オブジェクトを返す
const result = UserSchema.safeParse(input);
if (!result.success) {
  console.error(result.error.issues); // 失敗パスとメッセージの配列
  return;
}
const user2 = result.data; // ここで User 型に絞り込まれている
```

使い分けの指針はシンプルです。

- **`parse`**: 失敗を例外として上位のハンドラ（API のエラーレスポンス・グローバル catch）にまとめて流したいとき。境界で 1 回検証して、以降は型を信じて書くスタイルに向きます。
- **`safeParse`**: その場で分岐したいとき。フォーム入力のように「エラーをユーザーに見せて続行する」処理は `safeParse` のほうが素直です。

`result.success` は判別フィールドなので、`if (!result.success)` の early return で以降のスコープを `result.data: User` に絞り込めます。`try/catch` を書かずに型安全に分岐できるのが `safeParse` の気持ちよさです。

## 入力を「検証しながら正規化する」

zod は単なる型チェックにとどまらず、**入力を望ましい形に変換**できます。境界の値は文字列で来がちなので、ここが実務で効きます。

```typescript
const QuerySchema = z.object({
  // "10" のような文字列を数値に強制変換してから範囲チェック
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // 前後の空白を除去し、小文字化してから検証
  keyword: z.string().trim().toLowerCase().optional(),
  // 0/1 や "true"/"false" を boolean に寄せる
  includeArchived: z.coerce.boolean().default(false),
});

// URLSearchParams は全部 string。coerce があると素直に通る
const q = QuerySchema.parse({ limit: '50', keyword: '  AWS  ' });
// → { limit: 50, keyword: 'aws', includeArchived: false }
```

`.default()` を付けておくと、未指定時の値が **型レベルでも必須**になります（`z.infer` 上で `limit: number`、`undefined` を含まない）。「パースを通った時点で欠損がない」状態を作れるので、後続コードから optional チェックが消えます。

さらに踏み込んだ整形には `transform` を使います。

```typescript
const SlugSchema = z
  .string()
  .min(1)
  .transform((s) => s.toLowerCase().replace(/[\s/]+/g, '-'));

type Slug = z.infer<typeof SlugSchema>; // string（変換後の型）
```

## refine で「型では表せない制約」を書く

「パスワードと確認用が一致する」「開始日 < 終了日」のような **値どうしの関係**は型では表現できません。`refine` / `superRefine` の出番です。

```typescript
const PeriodSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((v) => v.from <= v.to, {
    message: '開始日は終了日以前である必要があります',
    path: ['to'], // エラーを to フィールドに紐付ける
  });
```

`path` を指定すると、フォーム UI で該当フィールドの下にエラーを出す、といった連携が楽になります。複数条件を個別に報告したいときは `superRefine` で `ctx.addIssue` を複数回呼びます。

## API 境界で検証する

ランタイムバリデーションが最も効くのは、信用できない入力が入ってくる **API のエッジ**です。Next.js の Route Handler ではこう書けます。

```typescript
import { z, ZodError } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

const CreatePostSchema = z
  .object({
    title: z.string().min(1, 'タイトルは必須です').max(120),
    body: z.string().min(1, '本文は必須です'),
    tags: z.array(z.string()).max(10).default([]),
  })
  .strict(); // 定義外のフィールドが来たら弾く

export async function POST(req: NextRequest) {
  try {
    const input = await req.json();
    const data = CreatePostSchema.parse(input); // ここを越えたら data は信頼できる
    // data.title / data.body / data.tags は検証済み
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: 'バリデーションに失敗しました', issues: e.issues },
        { status: 400 }
      );
    }
    throw e; // 想定外は上位へ
  }
}
```

ポイントは `.strict()` です。デフォルトの `z.object` は未知のフィールドを **黙って捨てる**（strip）ので、タイポした余分なキーに気付けません。更新系 API のように「定義したフィールドだけを受け付けたい」ケースでは `.strict()` を付けて、想定外の入力を 400 で弾くのが安全です。

## 実装ノート

nagiyu-platform でも zod は境界の防壁として実際に使っている。特徴的な使い方を 2 つ挙げておく。

1 つ目は **管理 API の入力検証**。`services/auth/web` のユーザー更新エンドポイントでは、スキーマを別ファイル（`app/api/users/schemas.ts`）に切り出している。

```typescript
export const UpdateUserSchema = z
  .object({
    name: z
      .string()
      .min(1, '名前は1文字以上で入力してください')
      .max(100, '名前は100文字以内で入力してください')
      .optional(),
    roles: z.array(z.enum(validRoleIds)).optional(),
  })
  .strict();
```

`validRoleIds` は `@nagiyu/common` の `ROLES` から `Object.keys(ROLES)` で動的に生成している。ロール定義を増やすと検証可能な値も自動で追従するので、ここでも「単一の真実源」を守れている。Route 側は `ListUsersQuerySchema.parse(...)` で受けて、`ZodError` を 400 に変換する。エラーメッセージはリポジトリ規約どおり **日本語**でスキーマに直書きし、`z.coerce.number()` でクエリの `limit` を数値化している——本記事で挙げた `coerce` / `.strict()` / 日本語メッセージが、ほぼそのまま実コードになっている。

2 つ目は **LLM の構造化出力の検証**。`services/livetalk/core` や `services/stock-tracker/batch` では、OpenAI に投げたレスポンスを zod スキーマで受けている。LLM の出力は「だいたい JSON」でしかなく型の保証がゼロなので、`z.infer` で得た型と `parse` のランタイム検証が二重の意味で効く。外部 API のうち最も信用できない相手に対して、zod は素直な防御線になる。

## ハマったポイント

zod を運用してきて踏みやすかった落とし穴を挙げておく。

- **`z.object` はデフォルトで未知キーを strip する**: バリデーションを通ったのに余分なキーが消えていて「なぜ保存されない？」と混乱しがち。意図に応じて `.strict()`（弾く）/ `.passthrough()`（通す）を明示する。
- **`coerce` は緩すぎることがある**: `z.coerce.number()` は空文字を `0` に、`z.coerce.boolean()` は非空文字すべてを `true` にする。クエリの欠損を `0`/`true` と誤認しないよう、`.optional()` や `undefined` への前処理とセットで考える。
- **`parse` の throw を握りつぶさない**: `try/catch` で `ZodError` を捕まえたら、必ず `instanceof ZodError` で判定する。想定外の例外まで 400 にしてしまうと、本当のバグが隠れる。
- **`transform` 後は入力型と出力型がずれる**: `z.infer` は **出力型**を返す。`transform` を挟むスキーマでは入力の型（`z.input<typeof S>`）と出力の型（`z.output<typeof S>`）が別物になることを意識する。
- **スキーマの置き場所**: 検証スキーマを Route ファイルに直書きすると再利用しづらい。auth/web のように `schemas.ts` へ切り出すと、テストからも型からも参照しやすい。

## まとめ

zod は「TypeScript の型が実行時に消える」という根本的なギャップを、**スキーマという単一の真実源**で埋めてくれます。`z.infer` で型を導出し、`parse` / `safeParse` で境界を守り、`coerce` / `transform` / `refine` で検証と正規化を同時にこなす——この流れを API のエッジに敷くだけで、「入ってきた時点で信用できる値」という安心領域をアプリの内側に広げられます。型定義とバリデーションの二重管理から解放されたい人は、まず最も信用できない入力（外部 API・LLM 出力・ユーザー入力）の 1 か所から導入してみるのがおすすめです。
