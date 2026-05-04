---
title: 'Amazon Cognito User Pool で OAuth 認証を実装する'
description: 'Amazon Cognito User Pool を使って Web アプリに OAuth 2.0 / OIDC 認証を実装する手順を解説。User Pool・App Client・Hosted UI・トークン検証・リフレッシュフローまで実装コードベースで紹介します。'
slug: 'cognito-oauth-implementation'
publishedAt: '2026-04-26'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['AWS', 'Cognito', '認証', 'OAuth']
---

## はじめに

ユーザー認証を自前で実装するのはセキュリティリスクの塊です。Amazon Cognito User Pool は OAuth 2.0 / OpenID Connect に準拠したフルマネージドの認証基盤で、サインアップ・MFA・パスワードリセットなどを設定だけで使えます。本記事では Web アプリに組み込む実装の流れを整理します。

## 全体構成

```
Browser
  ↓ /login をクリック
App Server
  ↓ Cognito Hosted UI へリダイレクト
Cognito Hosted UI
  ↓ ユーザーがログイン
  ↓ Authorization Code を返す（コールバック URL に GET）
App Server
  ↓ Authorization Code を Cognito の /oauth2/token に POST
Cognito
  ↓ ID Token + Access Token + Refresh Token
App Server
  ↓ トークンを Cookie / Session に保存
```

`response_type=code`（Authorization Code Flow）を使うのが推奨。Implicit Flow は古い方式で非推奨です。

## User Pool と App Client の作成

CDK での例:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';

const userPool = new cognito.UserPool(this, 'NagiyuUserPool', {
  selfSignUpEnabled: true,
  signInAliases: { email: true },
  autoVerify: { email: true },
  passwordPolicy: {
    minLength: 12,
    requireDigits: true,
    requireUppercase: true,
    requireSymbols: false,
  },
  mfa: cognito.Mfa.OPTIONAL,
});

userPool.addDomain('Domain', {
  cognitoDomain: { domainPrefix: 'nagiyu-auth' },
});

const appClient = userPool.addClient('NagiyuWebClient', {
  authFlows: { userSrp: true },
  oAuth: {
    flows: { authorizationCodeGrant: true },
    scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
    callbackUrls: ['https://nagiyu.com/api/auth/callback'],
    logoutUrls: ['https://nagiyu.com/'],
  },
});
```

`callbackUrls` は **完全一致**で照合されます。dev と prod で URL を変える場合は両方リストに含めます。

## ログインへのリダイレクト

```typescript
// app/api/auth/login/route.ts
export async function GET() {
  const url = new URL('https://nagiyu-auth.auth.ap-northeast-1.amazoncognito.com/oauth2/authorize');
  url.searchParams.set('client_id', process.env.COGNITO_CLIENT_ID!);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('redirect_uri', 'https://nagiyu.com/api/auth/callback');
  url.searchParams.set('state', crypto.randomUUID());

  return Response.redirect(url.toString(), 302);
}
```

`state` は CSRF 対策。Cookie に保存して、コールバック時に一致を確認します。

## コールバック処理

```typescript
// app/api/auth/callback/route.ts
import { cookies } from 'next/headers';

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code');
  if (!code) return Response.redirect('/?error=missing_code', 302);

  const tokenRes = await fetch(
    'https://nagiyu-auth.auth.ap-northeast-1.amazoncognito.com/oauth2/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.COGNITO_CLIENT_ID!,
        code,
        redirect_uri: 'https://nagiyu.com/api/auth/callback',
      }),
    }
  );

  if (!tokenRes.ok) return Response.redirect('/?error=token_exchange_failed', 302);

  const tokens = await tokenRes.json();
  const cookieStore = await cookies();
  cookieStore.set('id_token', tokens.id_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: tokens.expires_in,
  });
  cookieStore.set('refresh_token', tokens.refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.redirect('/', 302);
}
```

`id_token` は短命（既定 1 時間）、`refresh_token` は長命（既定 30 日）。両方を `httpOnly` Cookie に保存することで XSS による窃取を防ぎます。

## トークン検証

各リクエストでサーバー側が `id_token` を JWT として検証します。署名検証には Cognito の JWKS を使います。

```typescript
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://cognito-idp.ap-northeast-1.amazonaws.com/<UserPoolId>/.well-known/jwks.json')
);

export async function verifyIdToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://cognito-idp.ap-northeast-1.amazonaws.com/<UserPoolId>`,
    audience: process.env.COGNITO_CLIENT_ID,
  });
  return payload;
}
```

`payload.sub` がユーザー固有 ID、`payload.email` がメールアドレスとして取れます。

## リフレッシュフロー

`id_token` 期限切れ時には `refresh_token` で再取得します。

```typescript
async function refresh(refreshToken: string) {
  const res = await fetch(
    'https://nagiyu-auth.auth.ap-northeast-1.amazoncognito.com/oauth2/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.COGNITO_CLIENT_ID!,
        refresh_token: refreshToken,
      }),
    }
  );
  return res.json();
}
```

middleware（Next.js）で「id_token 残り 5 分以下なら裏でリフレッシュ」のような実装を仕込むと、ユーザー体験が滑らかになります。

## ログアウト

```typescript
// app/api/auth/logout/route.ts
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  cookieStore.delete('id_token');
  cookieStore.delete('refresh_token');

  const url = new URL('https://nagiyu-auth.auth.ap-northeast-1.amazoncognito.com/logout');
  url.searchParams.set('client_id', process.env.COGNITO_CLIENT_ID!);
  url.searchParams.set('logout_uri', 'https://nagiyu.com/');
  return Response.redirect(url.toString(), 302);
}
```

Cookie を消した上で、Cognito 側のセッションも切断するために `/logout` にリダイレクトします。これを忘れると、ブラウザ側 Cookie は消えていても Cognito 側は生きていて「再ログイン時にユーザー選択不要」になります。

## ハマりどころ

- **`callback_url` の末尾スラッシュ**: 厳密一致なので `/callback` と `/callback/` は別物。
- **`state` の検証忘れ**: CSRF 攻撃を許す穴になる。Cookie で必ず一致確認。
- **JWT の `kid` 不一致**: User Pool を再作成すると JWKS も変わる。古い token は検証失敗。
- **MFA 設定変更時のロックアウト**: MFA を OPTIONAL → REQUIRED に変えるとき、既存ユーザーが TOTP を設定し直す必要がある。
- **Hosted UI の見た目**: CSS で部分カスタマイズは可能だが完全自由ではない。完全 UI 自作なら `InitiateAuth` API を直接叩く（実装コスト増）。
- **複数 App Client の使い分け**: Web 用と モバイルアプリ用 で別 App Client を作る。クライアントシークレットの扱いが異なる（Web では使わない）。

## まとめ

Cognito User Pool は、サーバーレス時代の OAuth 認証基盤として完成度が高い選択肢です。User Pool + App Client + Hosted UI を CDK で立て、Authorization Code Flow を実装、JWT 検証とリフレッシュを組み込めば、安全な認証基盤が短時間で出来上がります。
