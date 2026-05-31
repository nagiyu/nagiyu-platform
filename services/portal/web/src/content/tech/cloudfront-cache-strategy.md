---
title: 'CloudFront キャッシュ戦略：TTL・Cache-Control・Invalidation の実践'
description: 'CloudFront のキャッシュを正しく効かせるための TTL 設定・Cache-Control ヘッダ設計・キャッシュキー・Invalidation の使いどころを実運用ベースで解説します。Next.js を CloudFront の背後に置く構成を例に取ります。'
slug: 'cloudfront-cache-strategy'
publishedAt: '2026-04-22'
updatedAt: '2026-05-31'
author: 'なぎゆー'
tags: ['AWS', 'CloudFront', 'キャッシュ', 'パフォーマンス']
---

## はじめに

CloudFront をオリジン（ALB / Lambda / S3）の前段に置くと、キャッシュヒットしているリクエストはオリジンに到達しません。これは **コスト削減** と **レスポンス速度向上** の両方に効きますが、設定を誤ると古いコンテンツが配信され続けたり、逆にキャッシュが全く効かなかったりします。本記事では実用的な戦略を整理します。

## キャッシュを決める 3 つの値

CloudFront のキャッシュ TTL は次の優先順位で決まります。

1. オリジン応答の `Cache-Control: max-age=...`（または `s-maxage`）
2. オリジン応答の `Expires` ヘッダ
3. CloudFront のキャッシュポリシーで設定した Default TTL

オリジン側からヘッダを返さないと、3 の Default TTL が使われます。**オリジン側でヘッダを返すのが最もコントロールしやすい**ので、本記事では基本この方針で書きます。

## 静的アセットは「URL ハッシュ + immutable」

Next.js が `/_next/static/chunks/abcd1234.js` のようにファイル名にハッシュを含めて出力するアセットは、内容が変わったらファイル名も変わります。つまり同じ URL なら未来永劫同じ中身です。

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};
```

`immutable` を付けるとブラウザが再検証もスキップするので、リロード時のリクエスト数が削減できます。CloudFront 側のキャッシュも 1 年効くため、ヒット率が劇的に上がります。

## SSG ページは「短めの max-age + s-maxage で長め」

Markdown を SSG で出力するブログ記事のように、内容は更新するけど頻繁ではないページは次のように設計します。

```
Cache-Control: public, max-age=60, s-maxage=86400, stale-while-revalidate=600
```

- `max-age=60`: ブラウザは 60 秒キャッシュ（読者の連打を抑える）
- `s-maxage=86400`: CloudFront は 1 日キャッシュ
- `stale-while-revalidate=600`: 期限切れでも 10 分間は古いものを返しつつ裏で更新

`s-maxage` を CDN 用に長めに取り、`max-age` をブラウザ用に短く取るのが定番です。

## SSR / API は基本「キャッシュしない」

ユーザーごとに違う応答を返す API・SSR ページは `Cache-Control: private, no-store` で完全にキャッシュ無効化します。これを忘れると、ログインユーザー A の応答がユーザー B に配信される事故が起きます。

```typescript
// Next.js Route Handler
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(data, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
```

CloudFront 側のキャッシュポリシーも `CachingDisabled` を割り当てて二重に防ぎます。

## キャッシュキーの設計

同じ URL でもデバイスや言語で出し分けたい場合は、キャッシュキーに含める要素を増やします。

```
キャッシュキー設定:
- Query strings: 必要なものだけホワイトリスト（例: page, sort）
- Headers: Accept-Language, CloudFront-Is-Mobile-Viewer
- Cookies: 認証 Cookie のみ（多くを含めるとキャッシュヒット率が下がる）
```

ヒット率を下げる要素は **キャッシュキーに含めないことが原則**です。例えば `?utm_source=...` のようなトラッキングパラメータが付くだけで別キャッシュ扱いになると、ほぼヒットしなくなります。CloudFront には「キャッシュキーには含めずオリジンにだけ転送する」設定（オリジンリクエストポリシー）があるので活用します。

## Invalidation の正しい使いどころ

`aws cloudfront create-invalidation --paths "/*"` のような全パージは強力ですが、**月 1,000 パスまで無料、それを超えると 1 パスあたり \$0.005 課金**です。デプロイのたびに `/*` を実行するとコストがかさみますし、CloudFront のヒット率も落ちます。

推奨パターン:

- **新リリース時の HTML ページ**: 該当パスだけ Invalidate（`/about`, `/services/*` など）
- **静的アセット**: ハッシュ付き URL なので Invalidate 不要
- **緊急時の全更新**: `/*` だが頻発させない

```bash
aws cloudfront create-invalidation \
  --distribution-id E1ABCDEFGHIJKL \
  --paths "/about" "/privacy" "/terms"
```

## デプロイ時の race condition に注意

CloudFront に古い HTML がキャッシュされている状態で新しい JS バンドルだけ更新すると、「古い HTML が新しい JS の存在しないチャンクを参照してエラー」という事態が発生します。Next.js の標準動作では HTML 側に対するハッシュチャンクの参照が変わるので問題は起きにくいですが、完全に防ぐには次の順序を守ります。

1. 新しい静的アセット（`_next/static/*`）を S3/オリジンに配置
2. 新しい HTML を生成・配信
3. 古い HTML 用の Invalidation 実行

## ヒット率の計測

CloudFront のヒット率は CloudWatch メトリクス `CacheHitRate` で確認できます。**目標は 80% 以上**ですが、SSR ページ比率が高いサイトでは 50% 程度になることもあります。

```
hit_rate = (hits) / (hits + misses)
```

ヒット率が低いときの典型原因:

- クエリパラメータがキャッシュキーに入っている（`utm_*` など）
- Cookie が不要に転送されている
- `Cache-Control: no-cache` をオリジンが返している
- 短すぎる TTL

CloudWatch Logs Insights で `x-edge-result-type` が `Miss` のリクエストを集計すると、原因の手がかりが掴めます。

## ハマったポイント

キャッシュ周りで私が実際にハマったもの、または運用上気をつけているものを挙げます。

- **`Vary: *`**: これを返すと CloudFront がキャッシュしない。意図せず Lambda@Edge / オリジンが返してしまうケースがある。
- **HTTPS と HTTP の混在**: `Vary: Host` を返さないと、CloudFront が一方の応答を他方に流す可能性がある。
- **OAI（Origin Access Identity）→ OAC への移行**: S3 オリジンの場合、新規構築は OAC を選ぶ。OAI は legacy 扱い。
- **デフォルトの最小 TTL が 1 秒**: オリジンが `max-age=0` を返してもエッジで 1 秒キャッシュされる。これも Cache Policy で `Min TTL = 0` にすれば回避できる。

一番ハマったのは、キャッシュそのものより **オリジンリクエストポリシーの Host ヘッダ**でした。nagiyu-platform の dev 環境は CloudFront のオリジンに Lambda Function URL を使っているのですが、最初に `ALL_VIEWER`（全ヘッダ転送）を割り当てたところ、Lambda Function URL に直接アクセスすると 200 なのに CloudFront 経由だと `403 AccessDeniedException` が返る、という状態になりました。原因は、CloudFront がビューワの `Host` ヘッダ（`*.cloudfront.net` 側）をそのままオリジンに転送してしまい、Lambda Function URL が自分のドメイン以外の Host を拒否していたためです。

```typescript
// 自分が最終的に採用した設定
originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
```

`ALL_VIEWER_EXCEPT_HOST_HEADER` に変えると、CloudFront が正しい Host（Lambda Function URL のドメイン）を送るようになり解消しました。キャッシュキー設計とは別の話ですが、「オリジンに何を転送するか」を握っているのも同じオリジンリクエストポリシーなので、自分はキャッシュ設計とセットで必ず確認するようにしています。

## 現在の運用

正直に書くと、nagiyu-platform のルートドメイン（Portal）の CloudFront は、現時点ではこの記事で推奨したほどキャッシュを作り込めていません。`infra/root/cloudfront-stack.ts` を見ると、デフォルトビヘイビアは `CachingDisabled` で、ALB オリジンへほぼ素通しする構成になっています。これは Next.js（standalone）の SSR / SSG をまず確実に配信することを優先した結果で、CDN レイヤでの静的アセット分離キャッシュは「これからの宿題」として残しているのが実情です。

なので今は、CDN でガッツリ効かせるというより、アプリ側が返す `Cache-Control`（`_next/static` の `immutable` など）とブラウザキャッシュに寄せています。私自身、この記事で書いた「アセットは長く、HTML は短く、SSR は無効化」という理想形に対して、自分のプラットフォームはまだ SSR 無効化の部分しか実装できていない、という温度感です。Information Gain の観点でも、こうした「理想と現状のギャップ」を正直に書けるのは実運用しているからこそだと思っています。

## まとめ

CloudFront のキャッシュ戦略は、「アセットは長く、HTML は短めに、SSR は無効化」という三層で考えると整理しやすいです。`Cache-Control` をオリジンから明示的に返し、キャッシュキーを最小限に絞り、Invalidation はピンポイントで使うのが、ヒット率もコストも安定する運用パターンです。
