# サービスごとの起動と勘所

探索担当に渡す補足の元ネタ。担当するサービスの節だけを、`explorer-instructions.md` と一緒にプロンプトへ貼る。記号の意味は次のとおり。

- `<W>`: そのサービスの web に割り当てたポート
- `<F>`: 偽の AWS サーバーに割り当てたポート
- `<ROOT>`: リポジトリルート
- `<SCRIPTS>`: `.claude/skills/exploratory-test/scripts` の絶対パス

起動の形は `explorer-instructions.md` の手順 3 を基本にし、ここでは「`.env.test` に足す環境変数」と「事前のビルド」だけを書く。足した環境変数は `.env.test` の値より優先される。

## 起動の段階の一覧

| 段階 | サービス | 必要なこと |
|---|---|---|
| A | tools / share-together / stock-tracker / niconico-mylist-assistant / portal | `.env.test` のまま動く。core のビルドだけ (portal と tools は core も無い) |
| B | auth / livetalk / admin | `.env.test` に環境変数を足す。admin はさらに偽の DynamoDB が要る |
| C | codec-converter / quick-clip | インメモリ DB の仕組みが無い。偽の AWS サーバーに向ける |

| サービス | web ディレクトリ | 事前にビルドするパッケージ |
|---|---|---|
| tools | `services/tools` | なし |
| portal | `services/portal/web` | なし |
| share-together | `services/share-together/web` | `@nagiyu/share-together-core` |
| stock-tracker | `services/stock-tracker/web` | `@nagiyu/stock-tracker-core` |
| niconico-mylist-assistant | `services/niconico-mylist-assistant/web` | `@nagiyu/niconico-mylist-assistant-core` |
| auth | `services/auth/web` | `@nagiyu/auth-core` |
| livetalk | `services/livetalk/web` | `@nagiyu/livetalk-core` |
| admin | `services/admin/web` | `@nagiyu/admin-core` |
| codec-converter | `services/codec-converter/web` | `@nagiyu/codec-converter-core` |
| quick-clip | `services/quick-clip/web` | `@nagiyu/quick-clip-core` |

`next dev` は web ディレクトリに `AGENTS.md` と `CLAUDE.md` を生成し、`next-env.d.ts` を書き換える。コミットしない。

## 全サービス共通の勘所

- `@nagiyu/ui` の TextField と Select は素の HTML (native select、補足文は `aria-describedby`)。MUI のセレクタは効かない。
- Playwright の `fill()` は数十万文字で 30 秒のタイムアウトになる。巨大な入力は value setter と input イベントで流す。
- クリップボードを使う機能は、context の permissions で許可する。
- ロールは `x-test-user-roles` ヘッダで差し替える (対応しているサービスのみ)。

## tools (段階 A)

- 認証なし。環境変数も不要。
- 数十万文字の入力は value setter で流す。クリップボードを使うツールは permissions を許可する。

## portal (段階 A)

- 環境変数も seed もモックも不要。
- 記事の描画の不具合は CSS (MarkdownContent の sx と globals.css) に集中している。`html, body { overflow-x: hidden }` がはみ出しを隠すので、`scrollWidth` ではなく要素ごとの右端で見る。
- dev (https://dev.nagiyu.com) は認証不要で、ローカルと見比べられる。

## share-together (段階 A)

- 別ユーザーとしてログインする仕組みは無い。`TEST_USER_ID` は起動時の環境変数で固定で、ヘッダで替えられるのはロールだけ。
- `POST /api/test/reset` に seed (users / groups / memberships / lists / todos。形は `tests/e2e/helpers` の `ResetSeedData`) を渡すと、他ユーザーのデータを作れる。招待する側とされる側、メンバーと非メンバーの状況を作れる。
- reset はユーザーを作り直さない。同じタブで reset すると、sessionStorage の登録済みフラグのせいでデフォルトリストが無いままになる。毎回新しい browser context を使う。
- `/api/auth/session` はテスト時に null を返す (ヘッダにアカウントメニューが出ないだけ)。

## stock-tracker (段階 A)

- ロールは `x-test-user-roles` ヘッダ (stock-viewer / stock-user / stock-admin)。
- `/api/test/reset` で初期化できる。DailySummary は seed できないので、サマリーの詳細と確度の表示は探索できない。
- アラートの作成には Web Push の購読のモックが要る (`tests/e2e/alert-management.spec.ts` の `mockPushSubscription`)。
- チャート (TradingView) は TSE (例: `TSE:7203`) なら取得できる。NASDAQ は API キーを `NASDAQ` にする (`NSDQ` は無効)。
- 「サマリー更新」は Lambda を呼ぶので、ローカルでは 500 になる。

## niconico-mylist-assistant (段階 A)

- seed: `POST /api/test/videos {count,startId,favoriteCount,skipUserSetting}`、`DELETE /api/test/videos` (全消し)。`POST /api/test/session` はダミーのセッションを入れる。
- ダミーのセッションは復号に失敗して `validity:'invalid'` になり、登録ボタンが無効になる。登録 UI を触るには、`page.route` で次をモックする。
    - `GET /api/niconico/session` を `{hasSession:true,validity:'valid'}` にする
    - `/api/mylist/register` と `/api/batch/status/**`
- seed 動画のサムネイルは `https://example.com/*.jpg` なので、route で 1x1 の PNG を返す。
- Service Worker を block すると、登録の送信が止まる (`serviceWorker.ready` を待つため)。登録を試すときは Service Worker を許可した context で。
- ニコニコの実 API は読み取りなら動く (検索、`sm9` の getthumbinfo)。外部への書き込み (マイリスト登録の実行) はしない。

## auth (段階 B)

- `.env.test` に足す: `USE_IN_MEMORY_DB=true`、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (ダミー)、`NEXTAUTH_URL` と `AUTH_URL` (どちらも `http://localhost:<W>`)。
- ユーザーを seed する手段が無い (OAuth の signIn コールバックでしか作られない)。一覧と編集の UI は `page.route('**/api/users?*')` などでモックし、実 API は権限、検証、404 の確認に使う。
- 「Google でサインイン」は、`accounts.google.com` を route で止めれば、遷移先と `authjs.callback-url` の Set-Cookie を観察できる。`next dev` では `__Host-` や `__Secure-` 付きの Cookie がブラウザに保存されない (Secure が付かない) ので、Set-Cookie ヘッダで確かめる。
- 編集画面のチェックボックスの name は `exact: true` で指定する (`admin` が `stock-admin` にも部分一致する)。

## livetalk (段階 B)

- `.env.test` に足す: `USE_IN_MEMORY_DB=true`、`VOICEVOX_URL=http://127.0.0.1:59999` (実在しない宛先にして外に出ないようにする)。OpenAI のキーは無いので、チャットの実 API は常にエラーになる。
- Live2D と sprite の画像は、本番では CloudFront 経由の S3 なので、ローカルでは 404 になる (ひよりは描画されない)。
- 同意は一度 POST すると保持される。リセットはサーバーの再起動か、`/api/consent` の GET のモック。
- チャットは `page.route('**/api/chat')` で NDJSON を返せば、text / sentence (base64 の WAV) / safety / lifecycle / error / done を再現できる。音声つきはアゲハ (`?character=ageha`) で見る。
- 記憶とノートは `/api/memory` と `/api/notes` の GET / DELETE をモックする。admin は `x-test-user-roles: livetalk-admin` で `/status` が開く。

## admin (段階 B、偽の DynamoDB)

`.env.test` に `USE_IN_MEMORY_DB` が無く、足してもエラー履歴の seed 手段が無い。偽の DynamoDB に向けて履歴を投入する。

1. 偽の DynamoDB を起動する: `FAKE_DDB_PORT=<F> node <SCRIPTS>/fake-aws/admin-fake-ddb.js` (`setsid` で起動し、グループ ID を控える)
2. 履歴を投入する: `FAKE_DDB_URL=http://127.0.0.1:<F> node <SCRIPTS>/fake-aws/admin-seed.js`
3. web を、`.env.test` に次を足して起動する。

    ```
    AWS_ENDPOINT_URL_DYNAMODB=http://127.0.0.1:<F>
    AWS_REGION=us-east-1
    AWS_ACCESS_KEY_ID=fake
    AWS_SECRET_ACCESS_KEY=fake
    ERROR_EVENTS_TABLE_NAME=errors-local
    DYNAMODB_TABLE_NAME=admin-local
    APP_URL=http://localhost:<W>
    NEXTAUTH_URL=http://localhost:<W>
    NEXT_PUBLIC_AUTH_URL=http://localhost:3001
    VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY=ダミーの鍵の組 (自分で生成する)
    ```

- キー: PK=`ERROR_EVENT#<サービス>`、SK と GSI1SK=`OCCURRED#<iso>#<id>`、GSI1PK=`ERROR_EVENT_ALL`、GSI 名 `AllByOccurredAt`。
- ロールは `x-test-user-roles` でサーバーとクライアントのセッションの両方に効く。空のロールは表現できず、既定の admin に戻る。
- Push は headless の chromium では使えない。`PushManager.prototype.subscribe` を `addInitScript` でモックする。

## codec-converter (段階 C、偽の AWS)

- 認証もロールも無い。画面はアップロードとジョブ詳細の 2 つだけ。
- 偽の AWS を起動する: `FAKE_PORT=<F> node <SCRIPTS>/fake-aws/codec-converter-fake-aws.js`
- web は `next dev --webpack`。次の環境変数を渡す。エンドポイントは `127.0.0.1` の IP にする (S3 が path-style になる。`localhost` だと virtual-host 形式になる)。

    ```
    AWS_ENDPOINT_URL=http://127.0.0.1:<F>
    AWS_ACCESS_KEY_ID=fakekey
    AWS_SECRET_ACCESS_KEY=fakesecret
    AWS_REGION=us-east-1
    DYNAMODB_TABLE=ダミー  S3_BUCKET=ダミー  BATCH_JOB_QUEUE=ダミー  BATCH_JOB_DEFINITION_PREFIX=ダミー
    ```

- ブラウザから署名付き URL へ直接 PUT するので、偽のサーバーは CORS に応える。
- 管理用: `POST /__admin/job` (seed)、`POST /__admin/patch {jobId,status,outputFile}` (状態の遷移)、`POST /__admin/toggles` (障害注入: s3PutFail / s3HeadFail / batchFail / ddbFail / delayMs)。

## quick-clip (段階 C、偽の AWS)

- 偽の AWS を起動する: `FAKE_PORT=<F> node <SCRIPTS>/fake-aws/quick-clip-fake-aws.js`。DynamoDB / S3 (マルチパートを含む) / Batch / Lambda を 1 ポートで動かす。
- web は `next dev --webpack`。次の環境変数を渡す。ETag を CORS で expose する必要があるが、偽のサーバーは既定で expose する。

    ```
    AWS_ENDPOINT_URL_DYNAMODB / _S3 / _BATCH / _LAMBDA=http://127.0.0.1:<F>
    AWS_ACCESS_KEY_ID=fakekey
    AWS_SECRET_ACCESS_KEY=fakesecret
    AWS_REGION=us-east-1
    DYNAMODB_TABLE_NAME / S3_BUCKET=qc-bucket / BATCH_JOB_QUEUE_ARN / BATCH_JOB_DEFINITION_PREFIX
    CLIP_REGENERATE_FUNCTION_NAME / ZIP_GENERATOR_FUNCTION_NAME=ダミー
    ```

- seed (`POST /__admin/...`): `seedJob {jobId,batchStatus,batchStage,analysisProgress,errorMessage}`、`seedHighlight {jobId,highlightId,order,startSec,endSec,status,clipStatus}`。文字起こしは `putObject {key,body}`。状態の遷移は `setBatch`、障害注入は `behavior {ddbFail,lambdaFail,s3PutFail,noEtagExpose,clipDelayMs,zipDelayMs}`。
- ジョブの状態は DynamoDB の `batchJobId` と Batch の DescribeJobs で決まる。ポーリング間隔は、処理中画面が 5 秒、見どころが 3 秒、ZIP が 3 秒。
- `tests/fixtures/sample.mp4` は 14 バイトのダミー。マルチパートを試すなら、100MB 以上のファイルを作業ディレクトリに作り、使い終わったら消す。
- 広告は `NEXT_PUBLIC_VAST_TAG_URL` を付けて再起動する (コンパイル時に埋め込まれる)。`page.route('https://imasdk.googleapis.com/**')` で abort や hang を制御する。
- 見どころ画面は PC のみの仕様。採否のラジオは楽観更新ではないので、`check()` ではなく `click()`。
