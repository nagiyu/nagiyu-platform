---
sources:
  - libs/common/package.json
  - libs/aws/package.json
sources_hash: fa49c0bae6134e85c754d279065129fb6e952578bd050a66206ffcc7aae4ae6a
---

# 共通ライブラリの規約

`libs/` の共通ライブラリを足す・使うときの規則。何を libs へ切り出すか、どこへ置くか、libs の中の書き方、サービスが libs を使うときの決まりを書く。各ライブラリの機能と振る舞いは `docs/platform/specs/lib/` の仕様にある。依存の方向は [アーキテクチャの規約](./architecture.md)、ビルド順は [モノレポの構成の規約](./monorepo.md) にある。

## 切り出す基準

### 2 サービス以上で使うものだけを libs へ切り出す

次のすべてを満たすものを切り出す。

- 2 サービス以上に実質的に同じ実装があるか、使う見込みが具体的にある。見込みで切り出すときは、実例か計画を根拠に示す。
- 特定のサービスのドメイン知識に依存せず、単体でテストできる。

次のものは切り出さない。

- 使う箇所が 1 つで、再利用の見込みがない。切り出すと、使われない抽象が残る。
- サービス固有のビジネスロジックを含む。
- ライブラリの関数を 1 枚包むだけの関数。冗長な間接層になる。元の関数を直接呼ぶ。

### 切り出す先は、依存するものの種類で決める

| 依存するもの | 置き場所 |
|---|---|
| 外部依存なし (Node.js 標準のみ) | `libs/common` |
| 外部ライブラリに依存する。フレームワークと AWS SDK には依存しない | `libs/common` の機能単位のサブパス (`@nagiyu/common/push` など) |
| Next.js・NextAuth | `libs/nextjs` |
| React | `libs/react` |
| ブラウザ API のみ (React なし) | `libs/browser` |
| AWS SDK | `libs/aws` |
| Material-UI の UI コンポーネント | `libs/ui` ([UI コンポーネントの規約](./ui-components.md)) |

サービス固有のコードは切り出さず、そのサービスのパッケージに置く。

## 依存

### `libs/common` のメインの入口は外部依存を持たない

メインの入口 (`@nagiyu/common`) は Node.js 標準だけで書く。外部ライブラリが要る機能は、サブパスに分ける (`web-push` は `@nagiyu/common/push`)。メインが外部依存を持つと、common を import するすべてのパッケージが、使わない外部依存まで引き込むためである。サブパスは `libs/common/package.json` の `exports` で宣言する。

### 外部依存は、lock の上でルートの `node_modules` の直下に置く

バッチ・Lambda のコンテナイメージは、ルートの `node_modules` と各パッケージのビルド成果物だけをコピーし、`libs/*/node_modules` はコピーしない。ライブラリの外部依存が `libs/*/node_modules` の下に入ると、イメージの中で解決できず、起動時に失敗する。Next.js の画面のイメージは、使うモジュールをビルド時に集めて同梱する (standalone 出力) ため、この制約を受けない。

CI のコンテナのビルド検証は、イメージの中でモジュールを読み込まない ([サービスの PR 検証](../specs/ci/service-verify.md))。この失敗は、デプロイして初めてわかる。外部依存を足す・上げるときは、lock で、そのパッケージが `libs/*/node_modules/` の下ではなく `node_modules/` の直下にあることを確かめる。ライブラリの下に入ったときは、lock を作り直してルートへ巻き上げる。その外部依存がさらに依存するパッケージが、ルートの別の版とぶつかって `node_modules/<パッケージ>/node_modules/` に入るのは問題ない。

### libs の中ではパスエイリアス (`@/`) を使わず、相対パスで import する

`tsc` は出力の import を書き換えないため、エイリアスがそのまま `dist` に残り、`dist` から解決できなくなる。libs の `tsconfig.json` には `paths` を置かない。強制する設定はなく、レビューで守らせる。

## 利用の規則

### ブラウザ API は `@nagiyu/browser` のラッパーを使う

Clipboard と localStorage は、`navigator.clipboard` や `window.localStorage` を直接触らず、`@nagiyu/browser` のラッパーを使う ([クリップボード](../specs/lib/browser/clipboard.md)、[localStorage](../specs/lib/browser/local-storage.md))。エラー処理を統一し、SSR で実行されても壊れず、テストでモックしやすくなるためである。

### Web Push は共通の部品を使い、サービスで書き直さない

- 購読は `@nagiyu/react` の hook (`usePushSubscription`) から行い、呼び出し側で公開鍵の取得とサーバー送信をつながない。つなぐ口を残すと、サービスごとに同じ処理が重複し、ユーザー操作での購読と再購読の分担が層をまたいで曖昧になる。layout には `@nagiyu/react` の `ServiceWorkerRegistration` を置く。許可済みユーザーの再購読はここが担い、各画面の購読 UI は初回の許可に専念する。
- 購読を受け取る API は、`@nagiyu/nextjs` のルートのファクトリ (`createVapidPublicKeyRoute`・`createPushSubscribeRoute`) で実装し、購読は `validatePushSubscription` を通す。検証が緩いと、送信時まで不正な購読に気づけない。サービス固有の保存先へ書くときは、ファクトリを写さず、保存のフック (`onSubscribe`) で保存だけを行う。
- 送信は `@nagiyu/common/push` を使う。VAPID 設定は `getVapidConfig()` で取り、環境変数を直接読まない。`sendWebPushNotification()` の薄いラッパーを作らず、複数の購読への一斉送信は `sendWebPushNotifications` を使う。通知アイコンは `DEFAULT_NOTIFICATION_ICON` を使い、URL を直書きしない。
- 購読の ID は `createSubscriptionId(endpoint)` で endpoint から決める。登録のたびに乱数を振ると、同じ端末で登録し直すたびに行が増え、同じ通知が重複して届く。既存の ID と互換を保つため、ID の形式は変えない。
- 無効な購読の扱いは、購読の持ち方がサービスごとに違うため、呼び出し側が決める。無効な購読はエラーとして数えない (端末側の都合で日常的に起き、エラー数で動く仕組みが本来の目的以外で発火するため)。削除に失敗しても後続を止めない (呼び出し元まで失敗させると、再試行で同じ通知が重複して届くため)。

振る舞いは [Web Push](../specs/lib/common/web-push.md)、[ブラウザの Web Push](../specs/lib/browser/web-push.md)、[購読](../specs/lib/react/push-subscription.md)、[Push のルート](../specs/lib/nextjs/push-routes.md) にある。

### `@nagiyu/nextjs` のファクトリを使い、サービスで書き直さない

- NextAuth の設定、ミドルウェア、セッションの取得は、`@nagiyu/nextjs` の関数で作る ([認証の規約](./authentication.md))。NextAuth の型 (`Session`・`User`・`JWT`) の拡張は `libs/nextjs/src/types/next-auth.d.ts` に集約し、サービスに置かない。セッションの戻り値は、サービス固有の型へ変換せず、`@nagiyu/common` の `Session | null` のままにする。
- Health ルートは `createHealthRoute` で作る。

振る舞いは [NextAuth の設定](../specs/lib/nextjs/auth-config.md)、[Health ルート](../specs/lib/nextjs/health-route.md)、[認証ミドルウェア](../specs/lib/nextjs/auth-middleware.md)、[セッション](../specs/lib/nextjs/session.md) にある。

### `@nagiyu/common` の共通の型と計算を使い、サービスで定義し直さない

- DB 上のユーザー情報の型は `@nagiyu/common` の `User` を使い、サービスで同じ型を定義しない。セッション上のユーザーは別の型 `SessionUser` で、`User` と区別する。
- 日本時間の日・月の期間キーと、その記録の TTL の計算は `@nagiyu/common` のものを使い、日本時間とのずれの計算をサービスで個別に書かない。
- 複数の必須環境変数の検証は `requireEnv` を使う。

振る舞いは [ロールと権限](../specs/lib/common/roles-and-permissions.md)、[JST の期間](../specs/lib/common/jst-period.md)、[検証](../specs/lib/common/validation.md) にある。

### AWS の操作は `@nagiyu/aws` の共通部品を使い、サービスで書き直さない

- すべての AWS クライアント (DynamoDB・S3・Batch・Lambda など) は、`@nagiyu/aws` のファクトリ関数 (`getDynamoDBDocumentClient()`・`getBatchClient()`・`getLambdaClient()` など) で初期化する。シングルトンのキャッシュを各サービスで実装すると、コードが重複し、保守の手間が増える。
- カーソルの変換 (`encodeCursor`・`decodeCursor`) と 1 ページ分の Query / Scan (`queryPage`・`scanPage`) は共通のものを使う。各所で書くと、`count` の入れ方などページの意味がずれる。
- BatchWriteItem / BatchGetItem の分割と未処理分の再送は共通の処理に任せ、サービスで分割・再送のループを書かない。
- `UpdateCommand` の `UpdateExpression` と名前・値の対応表は `buildUpdateExpression` で組み立て、手書きしない。使わない名前を表に残す、式に入れ忘れた値が残るといった不整合が起き、どちらも DynamoDB がエラーにする。
- 利用回数の上限を数える処理は `UsageCounter` を使い、条件付き更新の式を書かない。記録に失敗したときに通すか止めるかはサービスで違うため、呼び出し側が決める。
- Lambda ハンドラーと Batch のエントリポイントの報告 (`withErrorReporting`)、握りつぶした例外の報告 (`createErrorReporter`) は、共通の部品を使う ([エラー処理の規約](./error-handling.md))。
- EventBridge から定期実行される Lambda は `createScheduledHandler` で包む。失敗は 500 を返さず、例外を投げる。500 を返して正常終了すると Lambda としては成功になり、Errors アラーム・DLQ・非同期呼び出しの再試行が働かない。例外で失敗すると、再試行で途中まで済んだ処理がもう一度実行されうる。Push 通知のように副作用がある処理は、二重に実行されることを前提に設計する。対象 1 件ごとの失敗を数えて処理を続けるとき、最終的に Lambda の失敗にするかどうかは handler が決める。
- DynamoDB Local を使う契約テストのヘルパーは `@nagiyu/aws/testing` から import する。この specifier は `exports` に載せていない。載せると本番のコードから届く口になるため、解決するのは各サービスの `jest.contract.config.ts` の `moduleNameMapper` だけにしている。`exports` にないサブパスの import は、実装漏れではない。

振る舞いは `docs/platform/specs/lib/aws/` の仕様にある。リポジトリの組み立て (`EntityMapper` と `EntityStore` の合成を含む) は [データアクセスの規約](./data-access.md) にある。
