---
sources: []
---

# 認証の規約

Auth サービスにログインを集約し、各サービス (Consumer) がそのセッションを使うときの規則と、その理由。ロールの伝播とリフレッシュは `docs/services/auth/architecture.md` の「ロールの伝播とリフレッシュ」にある。強制している設定ファイルはなく、レビューで守らせるため、出典は持たない。

## 構成

### ログインは Auth サービスに集約し、Consumer は共有のセッション Cookie を検証するだけにする

OAuth プロバイダーとのやりとりと、セッション Cookie の発行は Auth サービスだけが行う。Consumer は `providers: []` で NextAuth を構成し、Auth が発行した JWT を検証する。`.nagiyu.com` (dev は `.dev.nagiyu.com`) の配下で Cookie を共有することで、サービス間のシングルサインオンになる。

### NextAuth の設定は `@nagiyu/nextjs` の関数で作る

Auth サービスは `createAuthConfig`、Consumer は `createServiceAuthConfig` を使う。Cookie・セッション・コールバックの共通部分をサービス側で個別に定義しない。サービスごとに定義すると、Cookie の名前やドメインがずれてシングルサインオンが壊れる。使い方と Cookie の中身は [NextAuth の設定](../specs/lib/nextjs/auth-config.md) にある。

### セッションの取得は `createSessionGetter` を使う

セッションの変換やテストセッションの生成をサービス側に持たない。使い方は [セッション取得](../specs/lib/nextjs/session.md) にある。

### Consumer は自分でロールを再取得しない

Consumer は DynamoDB を参照せず、共有 Cookie の JWT に入っているロールを読むだけにする。ロールの再取得は Auth サービスに集約し、Consumer が DynamoDB を参照せずに済むようにする。

### `AUTH_SECRET` は全サービスで同じ値にする

共有 Cookie の JWT を、発行する Auth と検証する Consumer が同じ鍵で扱うため。値は Auth サービスの Secrets Manager のシークレット (`nagiyu-auth-nextauth-secret-{環境}`) である。Lambda のサービスは、デプロイのワークフローが読んで CDK の Context で渡す ([ワークフローを書くときの規約](workflows.md))。ECS の livetalk は、タスク定義の `secrets:` でコンテナが Secrets Manager から直接受け取る。

## NextAuth のルートハンドラー

### Consumer の `[...nextauth]/route.ts` は GET だけを公開し、POST を出さない

`/api/auth/session` を返すため GET は公開する。クライアントの `useSession()` が `/api/auth/session` を fetch してセッションを得るので、GET がないとヘッダーのアカウントメニューなどが動かない。GET は `createClientSessionGetHandler` で包む。`SKIP_AUTH_CHECK=true` のとき、サーバー側のセッション取得とロールの見え方をそろえたテスト用セッションを返すため。例外として、share-together は包まず `export const { GET } = handlers` で公開している。

POST (サインアウトなど) を出さないのは、サインアウトを Cookie の発行元である Auth に集約しているため (全 Consumer の `route.ts` が同じ方針をコメントしている)。Consumer が受けると、内部ホスト名 (`ip-10-x-x-x.ec2.internal` など) へリダイレクトされ、`ERR_NAME_NOT_RESOLVED` で失敗する。この内部ホスト名は、ALB 配下の ECS で NextAuth が自分のベース URL を持たないときに出るもので、Lambda の Consumer で同じ失敗が起きることは確かめていない。

Auth サービスのルートハンドラーは GET と POST の両方を公開する。

### ECS で動くサービスは、`AUTH_URL` に自サービスの公開 URL を設定する

未設定だと、ECS コンテナの内部ホスト名が NextAuth のベース URL に使われ、サインインとセッション検証のリダイレクトが失敗する。ミドルウェアが権限なしのリダイレクトやサインイン後の戻り先を組み立てるときも、`request.url` が内部ホストになりうるため、公開 URL の `APP_URL` を優先する。

## サインイン・サインアウト

### サインアウトは Auth サービスに集約する

Consumer はサインアウトの処理を持たず、Auth のサインアウトの URL (`callbackUrl` つき) へ遷移させる。URL は `@nagiyu/ui` の `buildSignOutUrl` で作る ([認証の URL](../specs/lib/ui/auth-urls.md))。理由は、上のルートハンドラーの規則のとおり。

### 外から渡される `callbackUrl` は検証してから使う

オープンリダイレクトを防ぐため。`isAllowedNagiyuRedirectUrl` で、プラットフォームの中を指す URL だけを許す ([リダイレクト先 URL の検証](../specs/lib/common/redirect-url.md))。

## 認証と権限の確認

### 未認証のリダイレクトは、全ページでログインが必須なサービスではミドルウェアに任せる

ミドルウェアは `createAuthMiddleware()` で作り、個別に実装しない。リクエストごとに自動で認証を確かめ、未認証なら Auth のサインインへ飛ばせる。公開するパスは `publicPaths` / `isPublicPath` で指定する。使い方は [認証ミドルウェア](../specs/lib/nextjs/auth-middleware.md) にある。

ログインが任意のサービスは、ミドルウェアを置かず、ページや API で必要なときにセッションを確かめる。

### 権限の確認は、全ページで同じ権限を求めるならミドルウェア、ページごとに違うならページの中で行う

ミドルウェアの `requiredPermission` は、認証済みのユーザーに求める権限を 1 つだけ受け取る。ページごとに求める権限が違うサービスは、ミドルウェアでは認証だけを確かめ、権限はページやコンポーネントで `hasPermission` で見る。

### ログイン済みで権限がないユーザーには、`AccessDeniedView` を表示する

権限がない旨の 1 行表示や、無関係なページへのリダイレクトにはしない。`AccessDeniedView` の「アクセスを更新」から Auth の `/refresh` を経て元のページへ戻れるので、管理者が権限を付与したあとに、サインアウトせずに反映できる。部品の振る舞いは [エラー画面](../specs/lib/ui/feedback-views.md) にある。

例外として、stock-tracker は、ページの中の権限不足を `AccessDeniedView` ではなく `ErrorAlert` (権限エラー) で出す (exchanges、tickers、axis-performance)。

表示のしかたは、権限の見方で 2 通りある。

- **ミドルウェアで権限を見る場合**: ミドルウェアが権限のないページアクセスを `/forbidden?from=<元のパス>` へリダイレクトする。`/forbidden` は公開パスにし、`from` から戻り先を組み立てて `AccessDeniedView` に渡す。
- **ページの中で権限を見る場合**: URL を変えず、そのページが `AccessDeniedView` を返す。戻り先は、ボタンを押した時点の URL になる。

`/api` 配下は画面を出さず、JSON の 403 を返す。呼び出し側がステータスで分岐できるようにするため。
