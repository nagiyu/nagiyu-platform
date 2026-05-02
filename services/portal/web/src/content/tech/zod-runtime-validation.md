---
title: 'Zod でランタイムバリデーションと型推論を両立する'
description: 'Zod を使って API 入力・環境変数・外部 API レスポンスをランタイムでバリデーションしつつ、TypeScript の型推論も活かす実装方法を解説。スキーマ設計・エラーハンドリング・パフォーマンスの観点まで踏み込みます。'
slug: 'zod-runtime-validation'
publishedAt: '2026-03-25'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['TypeScript', 'Zod', 'バリデーション']
---

## はじめに

TypeScript の型はコンパイル時にしか効かないので、外部から来るデータ（API リクエスト・JSON ファイル・環境変数・外部 API レスポンス）が宣言した型と一致している保証はありません。Zod は **スキーマからランタイムバリデーションと TypeScript 型を同時に生成**できるライブラリで、この境界を埋めるのに最適です。本記事では nagiyu-platform で実装してきた使い方を整理します。

## 基本：スキーマから型を導く

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
  role: z.enum(['admin', 'member']),
});

type User = z.infer<typeof UserSchema>;
// → { id: string; email: string; age: number; role: 'admin' | 'member' }
```

スキーマと型が **同じ宣言から生まれる** ので、片方を変更したらもう片方が自動的に追従します。手動で `interface` と `validate` 関数を書く方式に比べてズレが起きません。

## API リクエストのバリデーション

Next.js Route Handler で受け取った body をバリデーションする例:

```typescript
// app/api/users/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  acceptedTerms: z.literal(true),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateUserSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: 'INVALID_INPUT', issues: parsed.error.issues }, { status: 400 });
  }

  // parsed.data は CreateUserInput 型として安全に使える
  const user = await createUser(parsed.data);
  return Response.json({ id: user.id }, { status: 201 });
}
```

`safeParse` は `{ success, data | error }` の判別共用体を返すので、エラー時の枝で `data` にアクセスしようとすると TypeScript が止めてくれます。

## 環境変数のバリデーション

`process.env` は文字列の辞書なので、未設定値や型ミスマッチを実行時まで気づけないことが多いです。アプリ起動時に一括検証します。

```typescript
// src/lib/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  AWS_REGION: z.string().default('ap-northeast-1'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
});

export const env = EnvSchema.parse(process.env);
```

- `transform(Number)` で文字列を数値化して返せる
- `default(...)` で未設定時のフォールバック
- `parse` は失敗時に throw するので、起動時に即座に検出できる

## 外部 API レスポンスをそのまま信じない

外部サービスのレスポンスは予告なく変わることがあります。型を信じて `.title` にアクセスしてランタイムで undefined、というバグが多発します。

```typescript
const GitHubRepoSchema = z.object({
  full_name: z.string(),
  stargazers_count: z.number(),
  description: z.string().nullable(), // null を許容
  topics: z.array(z.string()).default([]),
});

async function getRepo(owner: string, repo: string) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  const json = await res.json();
  return GitHubRepoSchema.parse(json);
}
```

API が `topics` を返さないバージョンに変わっても、`default([])` のおかげで自動的に空配列扱いになります。スキーマで吸収できる差分は吸収する設計が長持ちします。

## refine と superRefine で複合条件

単一フィールドの制約を超える条件は `refine` を使います。

```typescript
const PasswordSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  });
```

`path` を指定すると、フォームライブラリ（react-hook-form など）でフィールド単位のエラーとして紐付けられます。

## エラーの整形

Zod の `error.issues` は次のような構造で、配列でフィールドごとに 1 件ずつ入っています。

```json
[
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": ["email"],
    "message": "Required"
  }
]
```

API レスポンスとして整形するヘルパを 1 つ作っておくと再利用しやすいです。

```typescript
import type { ZodError } from 'zod';

export function toFieldErrors(err: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.join('.');
    result[path] = issue.message;
  }
  return result;
}
```

## パフォーマンス

Zod のパースはオブジェクト 1 件で **数 μ〜数十 μ秒**程度なので、1 リクエストあたり数十回呼んでも実用上問題ありません。ただし以下に注意:

- **巨大配列**: 1 万件配列を `array(itemSchema).parse()` するとそれなりに時間がかかる
- **再帰スキーマ**: ネストの深いスキーマは Type 推論が遅くなり、エディタが重くなる
- **`union` の組み合わせ爆発**: 大きい discriminated union は順番にチェックする時間が増える

巨大配列やバッチ処理では「先頭 1 件だけ Zod、残りは型アサーション」のような割り切りもあります。

## ハマりどころ

- **`z.coerce.number()` の罠**: 文字列を `Number(value)` で強制変換するため、`""` や `"abc"` も `NaN` になる。`refine` で NaN チェックを足す。
- **`.optional()` と `.nullable()` の混同**: 前者は `T | undefined`、後者は `T | null`。両方許容するには `.nullish()` または `.optional().nullable()`。
- **`safeParse` を使わずに `parse` を呼んで try/catch**: 型推論的には同じだが、判別共用体で扱うほうが網羅性チェックが効く。
- **JSON Schema 生成**: Zod スキーマから OpenAPI Schema を作りたいなら `zod-to-json-schema` などの補助ライブラリが必要。
- **エラーメッセージの日本語化**: `z.string({ required_error: '必須です' })` で個別指定するか、`z.setErrorMap` でグローバル設定できる。

## まとめ

Zod は「TypeScript の型をランタイムでも信じられる」ツールです。API 入力・環境変数・外部 API レスポンスの 3 箇所に Zod を置いて、それ以外の内部は型を信頼する、というレイヤリングで、コードの安全性と開発速度が両立できます。
