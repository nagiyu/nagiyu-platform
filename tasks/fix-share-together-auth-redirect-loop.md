# Share Together 認証リダイレクトループの修正

## 概要

Share Together の dev 環境にて、auth サービスにログイン後、再度 auth サービスにリダイレクトされる無限ループが発生している。
原因は Share Together の `auth.ts` が独自の Cookie 設定を持ち、auth サービスおよび他サービスと Cookie 名が一致しないことによる。

## 関連情報

- Issue: 認証の改善
- タスクタイプ: サービスタスク（Share Together Web）

## 根本原因

### Cookie 名の不一致

全サービスは Docker で `ENV NODE_ENV=production` が設定された状態で動作する。
この環境での各サービスの Cookie 名の扱いに差異がある。

**auth サービス・Niconico Mylist Assistant**（`createAuthCookies` from `@nagiyu/nextjs` 使用）:

```
isProduction = resolvedNodeEnv === 'prod'  // 'production' は prod 扱いにならない
cookieSuffix = '.dev'  // NODE_ENV=production の場合
sessionToken Cookie 名: __Secure-authjs.session-token.dev
```

**Share Together**（独自実装）:

```
isProduction = nodeEnv === 'prod' || nodeEnv === 'production'  // 'production' を prod 扱い
cookieSuffix = ''  // NODE_ENV=production の場合
sessionToken Cookie 名: __Secure-authjs.session-token  // ← 不一致！
```

### 影響の流れ

1. ユーザーが Share Together（dev 環境）にアクセス
2. middleware が未認証と判断し、auth サービスへリダイレクト
3. ユーザーが auth サービスでログイン成功
4. auth サービスが Cookie `__Secure-authjs.session-token.dev` を設定
5. Share Together の callbackUrl にリダイレクト
6. Share Together middleware が `__Secure-authjs.session-token`（サフィックスなし）を探すが見つからない
7. 再び未認証と判断し auth へリダイレクト → **無限ループ**

### 他サービスで発生しない理由

- **Stock Tracker**: middleware がなく、API レベルで `withAuth` を使用。`createAuthCookies` を経由するため Cookie 名が一致する。
- **Niconico Mylist Assistant**: `createAuthConfig`（`@nagiyu/nextjs`）を使用するため Cookie 名が一致する。

## 要件

### 機能要件

- FR1: Share Together dev 環境でログイン後、正常にアプリへリダイレクトされること
- FR2: auth サービスが設定した Cookie を Share Together が正しく読み取れること

### 非機能要件

- NFR1: 他サービスと同様に `@nagiyu/nextjs` の `createAuthConfig` を使用すること
- NFR2: テストカバレッジ 80% 以上を維持すること

## 実装方針

Niconico Mylist Assistant と同様に、Share Together の `auth.ts` を `createAuthConfig` を使用するパターンに統一する。

### 変更箇所

1. **`services/share-together/web/package.json`**
    - `@nagiyu/nextjs` を依存関係に追加

2. **`services/share-together/web/auth.ts`**
    - 独自 Cookie 実装を削除
    - `createAuthConfig` を使用するシンプルな実装に変更
    - `includeSubAsUserIdFallback: true` を指定（既存の `token.sub` フォールバックを維持）

3. **`services/share-together/web/tests/unit/auth.test.ts`**
    - `NODE_ENV=production` では `.dev` サフィックス付き Cookie 名が期待される動作に更新
    - `NODE_ENV=prod` のみサフィックスなし Cookie 名として扱われることを検証

### 参考実装（Niconico Mylist Assistant）

`services/niconico-mylist-assistant/web/src/auth.ts`:

```typescript
import NextAuth, { type NextAuthConfig } from 'next-auth';
import { createAuthConfig } from '@nagiyu/nextjs';

export const authConfig: NextAuthConfig = {
  providers: [],
  trustHost: true,
  ...createAuthConfig({ includeSubAsUserIdFallback: true }),
  pages: {
    signIn: `${process.env.NEXT_PUBLIC_AUTH_URL}/signin`,
  },
};

const nextAuth = NextAuth(authConfig);
export const { handlers, auth, signIn, signOut } = nextAuth;
```

## タスク

- [x] T001: 根本原因の調査・特定（Cookie 名不一致）
- [x] T002: `package.json` に `@nagiyu/nextjs` を追加
- [x] T003: `auth.ts` を `createAuthConfig` 使用パターンに変更
- [x] T004: `tests/unit/auth.test.ts` を Cookie 名の期待値に合わせて更新
- [x] T005: ユニットテスト実行・確認（197テスト全通過）
- [x] T006: ビルド確認（lint/format check 通過）

## 参考ドキュメント

- `docs/development/rules.md` - コーディング規約
- `libs/nextjs/src/auth-config.ts` - `createAuthConfig` 実装
- `services/niconico-mylist-assistant/web/src/auth.ts` - 参考実装

## 備考・未決定事項

- dev 環境の `NODE_ENV` が `production` に設定されているため、本修正後は dev 環境でも `.dev` サフィックスが使われる。
  これは auth サービス・Niconico と一致した動作であり、意図通り。
- 本番環境（`NODE_ENV=prod`）では引き続きサフィックスなしが使用される。
- Share Together の session callback では `roles`、`email`、`name`、`image` フィールドが設定されていなかったが、
  `createAuthConfig` 使用後は `createAuthCallbacks` によりこれらも設定されるようになる。
