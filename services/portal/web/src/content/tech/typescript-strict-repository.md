---
title: 'TypeScript strict mode で書く型安全な Repository パターン'
description: 'TypeScript の strict モードで Repository パターンを実装する具体的な方法を解説。エンティティ型の定義・null と undefined の扱い・トランザクション・テスト容易性まで、実プロダクトで効く型設計を整理します。'
slug: 'typescript-strict-repository'
publishedAt: '2026-03-15'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['TypeScript', 'Repository', '型設計']
categories: ['dev-stack']
---

## はじめに

データアクセス層を Repository パターンで切り出すと、ビジネスロジックから DB 実装を分離できます。TypeScript の `strict` モードと組み合わせると、null 安全・引数型・戻り型のすべてを型でガードできます。本記事では nagiyu-platform で採用している実装を整理します。

## エンティティ型と DTO 型を分ける

DB スキーマと API 出力は別物として扱います。

```typescript
// エンティティ：DB から読み出した形（内部用）
export type UserEntity = {
  id: string;
  email: string;
  passwordHash: string; // 内部のみ
  createdAt: Date;
  deletedAt: Date | null;
};

// DTO：API レスポンス用（外部公開）
export type UserDto = {
  id: string;
  email: string;
  createdAt: string; // ISO 文字列
};

// 変換
export function toUserDto(entity: UserEntity): UserDto {
  return {
    id: entity.id,
    email: entity.email,
    createdAt: entity.createdAt.toISOString(),
  };
}
```

`passwordHash` のような内部のみのフィールドが **API 経由で漏れない**ことを型で保証できます。`UserEntity` を直接 `Response.json` に渡すと型チェックは通っても意味的に NG なので、リポジトリは Entity を返し、ハンドラ層で DTO 化、というレイヤリングが守れます。

## Repository インターフェース

```typescript
export interface UserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  create(input: CreateUserInput): Promise<UserEntity>;
  update(id: string, patch: UpdateUserInput): Promise<UserEntity>;
  softDelete(id: string): Promise<void>;
}

export type CreateUserInput = {
  email: string;
  passwordHash: string;
};

export type UpdateUserInput = Partial<Pick<UserEntity, 'email' | 'passwordHash'>>;
```

- 「**見つからない**は `null` を返す」「**書き込み失敗は throw**する」という規約を統一する
- 入力型は `Pick` / `Partial` で必要なフィールドだけ要求する
- 型はインターフェース、実装は別ファイルに分けるとテスト用の差し替えが楽になる

## DynamoDB 実装

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

export class DynamoDBUserRepository implements UserRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async findById(id: string): Promise<UserEntity | null> {
    const res = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { id } }));
    if (!res.Item) return null;
    return this.toEntity(res.Item);
  }

  async create(input: CreateUserInput): Promise<UserEntity> {
    const entity: UserEntity = {
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      createdAt: new Date(),
      deletedAt: null,
    };
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.toItem(entity),
        ConditionExpression: 'attribute_not_exists(id)',
      })
    );
    return entity;
  }

  // ... toEntity / toItem は Date <-> ISO 変換を担う
}
```

`toEntity` / `toItem` で **DynamoDB のレコード形式** と **TypeScript の型**を変換するレイヤーを 1 箇所に集約します。Date 型は DB に保存できないので ISO 文字列に変換、読み出し時に Date に戻す、という処理を Repository の中に閉じ込めます。

## strict モードを最大限活かす

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
  },
}
```

- **`noUncheckedIndexedAccess`**: `array[i]` の戻り値が `T | undefined` になる。配列アクセスでの境界チェック漏れを防ぐ
- **`exactOptionalPropertyTypes`**: `field?: string` に `undefined` を明示的に代入できなくなる。`{ field: undefined }` を渡すコードがエラーになる

`strict: true` だけでは拾えないバグが、この 2 つの追加フラグで早期に検出できます。

## エラーをドメイン型で表現する

throw で済ませず、想定エラーを型で返したいケースもあります。Result 型を導入する例:

```typescript
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export type CreateUserError = 'EMAIL_TAKEN' | 'PASSWORD_TOO_WEAK';

async function createUser(
  repo: UserRepository,
  input: CreateUserInput
): Promise<Result<UserEntity, CreateUserError>> {
  const existing = await repo.findByEmail(input.email);
  if (existing) return { ok: false, error: 'EMAIL_TAKEN' };
  if (input.passwordHash.length < 60) return { ok: false, error: 'PASSWORD_TOO_WEAK' };
  return { ok: true, value: await repo.create(input) };
}
```

呼び出し側は `if (!result.ok)` で網羅的にハンドリングできます。throw するより制御フローが追いやすくなる代わりに、try/catch とのハイブリッド設計が必要になります。

## テスト容易性

Repository をインターフェースで定義すると、テストでは In-Memory 実装に差し替えられます。

```typescript
class InMemoryUserRepository implements UserRepository {
  private store = new Map<string, UserEntity>();

  async findById(id: string) {
    return this.store.get(id) ?? null;
  }
  async findByEmail(email: string) {
    return [...this.store.values()].find((u) => u.email === email) ?? null;
  }
  async create(input: CreateUserInput) {
    const e: UserEntity = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date(),
      deletedAt: null,
    };
    this.store.set(e.id, e);
    return e;
  }
  async update(id: string, patch: UpdateUserInput) {
    const cur = this.store.get(id);
    if (!cur) throw new Error('not found');
    const next = { ...cur, ...patch };
    this.store.set(id, next);
    return next;
  }
  async softDelete(id: string) {
    const cur = this.store.get(id);
    if (cur) this.store.set(id, { ...cur, deletedAt: new Date() });
  }
}
```

DynamoDB を立ち上げずにビジネスロジックの単体テストが書け、CI も高速になります。

## ハマりどころ

- **Date と string の混在**: Repository の境界で完全に変換しないと、後段で `.toISOString` を呼べない／呼んだら例外、が起きる。
- **`null` と `undefined` の使い分け**: 「明示的に未設定」は `null`、「フィールド自体が存在しない」は `undefined`、と決めて統一する。
- **トランザクション**: DynamoDB の `TransactWrite` のように複数オペレーションを束ねたいとき、Repository の interface 設計を見直す必要がある（Unit of Work パターン）。
- **過度な抽象化**: 1 サービスでしか使わないなら、わざわざ Repository インターフェースを切らずに直書きで十分なケースもある。チーム規模・サービス数で判断する。

## まとめ

TypeScript strict + Repository パターンは、データアクセスの境界を型で固定し、ビジネスロジックとテストを安定して書ける構成です。Entity / DTO の分離、Result 型の活用、In-Memory 実装でのテスト、と組み合わせれば、運用フェーズでの変更にも強い設計が手に入ります。
