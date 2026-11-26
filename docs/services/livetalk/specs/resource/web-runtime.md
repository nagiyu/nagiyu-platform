---
sources:
  - infra/livetalk/lib/ecs-service-stack.ts
  - infra/livetalk/lib/alb-stack.ts
  - infra/livetalk/bin/livetalk.ts
  - infra/common/src/utils/ssm.ts
  - infra/common/src/utils/naming.ts
  - services/livetalk/web/Dockerfile
sources_hash: 22de02f0df909bae4231d0c43ced8c116dadc20664dca05f31d7ffb1f8e86514
---

# Web の実行環境

Next.js の Web と VOICEVOX を 1 つのタスクに同居させて動かす ECS (Fargate) のサービスと、その前に置く専用の ALB。サービスは共有の ECS クラスターに載り、ALB・ターゲットグループ・セキュリティグループ・ロググループ・ロールはこのサービスが持つ。公開の入口は CloudFront で、ALB をオリジンにする ([デプロイ先](../deploy.md))。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-livetalk-service-{env}` | ECS サービス (Fargate) | タスクを 1 つ動かす。スタックは `NagiyuLiveTalkService{Env}` |
| `nagiyu-livetalk-task-{env}` | ECS タスク定義 (ファミリー) | 2 つのコンテナ `livetalk-web` と `voicevox` を持つ |
| `nagiyu-livetalk-alb-{env}` | ALB (インターネット向け) | CloudFront からの入口。スタックは `NagiyuLiveTalkAlb{Env}` |
| `nagiyu-livetalk-tg-{env}` | ターゲットグループ | `livetalk-web` のポート 3000 へ転送する |
| HTTP リスナー (ポート 80) | ALB のリスナー | ターゲットグループへ転送する |
| `nagiyu-livetalk-alb-sg-{env}` | セキュリティグループ | ALB に付ける |
| `nagiyu-livetalk-task-sg-{env}` | セキュリティグループ | タスクに付ける |
| `/ecs/nagiyu-livetalk-task-{env}` | CloudWatch Logs のロググループ | 2 つのコンテナのログ |
| タスク実行ロール、タスクロール (名前は CDK が決める) | IAM ロール | 起動時の権限と、実行中の権限 |
| ECR リポジトリ `nagiyu-livetalk-ecr-{env}` | ECR | `livetalk-web` のイメージ ([デプロイ先](../deploy.md)) |

`{env}` は `dev` か `prod`、`{Env}` は `Dev` か `Prod`。共有のクラスターは `nagiyu-shared-cluster-{env}` ([共有 ECS クラスター](../../../../platform/specs/resource/ecs-cluster.md))。タグは `Application` が `nagiyu`、`Environment` が環境名、`ManagedBy` が `CDK`、`Component` が `livetalk`。

## 設定値

### タスク定義

| 項目 | dev | prod |
|---|---|---|
| CPU | 1,024 | 2,048 |
| メモリ | 2,048 MB | 4,096 MB |

| コンテナ | イメージ | ポート | 依存・ヘルスチェック |
|---|---|---|---|
| `voicevox` | `voicevox/voicevox_engine:cpu-0.25.2` を digest (`sha256:eb8c7f46a7d01217d1ff2b6f018261faedeceded3cc756b4fbbf371791ad6c90`) で固定。Docker Hub から pull する | 50021 | `curl -f http://localhost:50021/version`。間隔 15 秒、タイムアウト 5 秒、5 回失敗で異常、起動猶予 60 秒。必須 (`essential`) |
| `livetalk-web` | ECR の `nagiyu-livetalk-ecr-{env}`。タグはデプロイのときの `IMAGE_TAG` | 3000 | `voicevox` が `HEALTHY` になってから起動する |

- ログは両方とも、ログドライバー `awslogs`、ストリームの接頭辞 `ecs`、ロググループは上の 1 つ。保持期間は 1 週間で、スタックを消すと一緒に消える
- `voicevox` は、環境変数 `VV_CPU_NUM_THREADS` を 2 にして、並列の合成を受ける
- イメージの `CMD` は `node services/livetalk/web/server.js`

### サービス

| 項目 | 値 |
|---|---|
| タスクの数 | 1 |
| 配置 | 共有 VPC のパブリックサブネット。パブリック IP を付ける |
| キャパシティープロバイダー | dev は `FARGATE_SPOT`、prod は `FARGATE` (重み 1) |
| ヘルスチェックの猶予 | 120 秒 |
| ALB への登録 | `livetalk-web` のポート 3000 を明示して登録する |
| 反映 | デプロイのたびに、ワークフローが強制的に再デプロイする ([デプロイ先](../deploy.md)) |

### ALB とターゲットグループ

| 項目 | 値 |
|---|---|
| 公開 | インターネット向け。共有 VPC のパブリックサブネット |
| アイドルタイムアウト | 120 秒 |
| リスナー | HTTP のポート 80 だけ。HTTPS のリスナーは持たない |
| ターゲットの種類 | IP |
| ターゲットグループのポート・プロトコル | 3000・HTTP |
| ヘルスチェック | `/api/health`、間隔 30 秒、タイムアウト 5 秒、正常 2 回・異常 2 回で判定 |
| 登録解除の待ち | 30 秒 |

### セキュリティグループ

| グループ | 向き | 許可 |
|---|---|---|
| ALB | 入り | TCP 80 と TCP 443 を任意の IPv4 から |
| ALB | 出 | すべて |
| タスク | 入り | TCP 3000 を ALB のセキュリティグループから。50021 は開けない |
| タスク | 出 | すべて |

### SSM のパラメータ

スタックの間は、名前から ARN を組み立てるか、SSM のパラメータで結ぶ (CloudFormation の Export / Import は使わない)。名前の定義は `infra/common/src/utils/ssm.ts` の `SSM_PARAMETERS`。

| パラメータ | 書くスタック | 読むスタック |
|---|---|---|
| `/nagiyu/livetalk/{env}/alb/dns-name` | ALB | CloudFront ([アセットの配信](./assets.md))、デプロイのワークフロー (ヘルスチェック) |
| `/nagiyu/livetalk/{env}/alb/arn` | ALB | アラーム ([監視](./monitoring.md)) |
| `/nagiyu/livetalk/{env}/alb/listener-arn` | ALB | - |
| `/nagiyu/livetalk/{env}/alb/target-group-arn` | ALB | Service、アラーム |
| `/nagiyu/livetalk/{env}/alb/security-group-id` | ALB | Service |
| `/nagiyu/livetalk/{env}/ecs/service-name` | Service | - |
| `/nagiyu/shared/{env}/ecs/cluster-name` | shared ([共有 ECS クラスター](../../../../platform/specs/resource/ecs-cluster.md)) | Service |

- 「-」は、出典のコードに読む箇所がないもの
- Service は ALB のスタックの後にデプロイされる。SSM 経由の参照は CDK が依存を検出できないので、明示的に依存を宣言している

## 環境変数

`livetalk-web` のコンテナに渡す値。

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `NODE_ENV` | 実行環境の名前 | 環境名 (`dev` / `prod`) |
| `LIVETALK_ENV` | [メトリクス](./monitoring.md)の `Environment` ディメンションの値 | 環境名 |
| `NAGIYU_ENV` | ログイン用クッキーのドメインの判定に使う環境名 | 環境名 |
| `PORT` | 待ち受けるポート | `3000` |
| `APP_VERSION` | 死活確認 API が返すバージョン | デプロイ時の環境変数 `APP_VERSION`。なければ `1.0.0` |
| `NEXT_PUBLIC_AUTH_URL` | Auth サービスの URL (ログインへのリダイレクト先) | 環境ごとの Auth サービスの URL |
| `APP_URL`、`AUTH_URL` | このサービスの URL | 環境ごとのこのサービスの URL ([デプロイ先](../deploy.md)のホスト名) |
| `VOICEVOX_URL` | VOICEVOX の接続先 | `http://localhost:50021` |
| `DYNAMODB_TABLE_NAME` | [テーブル](../data/main-table.md)の名前 | `nagiyu-livetalk-dynamodb-{env}` |
| `TZ` | プロセスのタイムゾーン | `Asia/Tokyo` |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込み先 | `nagiyu-error-events-{env}` |

コンテナの `secrets` (Secrets Manager の値) は、タスクの起動のときに ECS が取り出して、環境変数として渡す。

| 名前 | 値の出どころ |
|---|---|
| `AUTH_SECRET` | Auth のシークレット ([Auth のシークレット](../../../auth/specs/resource/secrets.md)) |
| `OPENAI_API_KEY` | [シークレット](./secrets.md)の OpenAI API キー |
| `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` | [シークレット](./secrets.md)の VAPID キー (JSON の `publicKey` と `privateKey`) |

- `AUTH_URL` を渡すのは、渡さないと NextAuth がコンテナの内部ホスト名を使い、ログインとセッション検証のリダイレクトが名前解決に失敗するため
- 時刻と日付の判定は、コードが日本時間を明示して求める。`TZ` には頼らない

## 権限

| ロール | 対象 | 許可する操作 |
|---|---|---|
| タスク実行ロール | AWS 管理ポリシー `AmazonECSTaskExecutionRolePolicy` | イメージの取得とログの出力に必要な操作 |
| タスク実行ロール | `nagiyu-livetalk-ecr-{env}` | `ecr:BatchCheckLayerAvailability`、`ecr:GetDownloadUrlForLayer`、`ecr:BatchGetImage` |
| タスク実行ロール | すべてのリソース | `ecr:GetAuthorizationToken` (対象を絞れない操作) |
| タスク実行ロール | Auth・OpenAI API キー・VAPID の 3 つのシークレット | 読み取り (`grantRead`。`secretsmanager:GetSecretValue` を含む) |
| タスクロール | [テーブル](../data/main-table.md)とそのインデックス | 読み書き (`grantReadWriteData`) |
| タスクロール | [エラーイベントのテーブル](../../../../platform/specs/data/error-events.md) | `dynamodb:PutItem` (`grantErrorEventsWrite`) |

- シークレットを読むのはタスク実行ロールで、タスクロールは Secrets Manager を読まない。`secrets` を取り出すのは、コンテナを起動する ECS のエージェントだから
- テーブルのインデックスを読む権限は、テーブルを `fromTableAttributes` に `globalIndexes` を付けて取り込むことで付く。`fromTableArn` で取り込むと付かず、インデックスの Query が `AccessDenied` になる

## 理由

- 1 つのタスクに Next.js と VOICEVOX を同居させる。Next.js から `localhost:50021` で VOICEVOX を呼ぶので、デプロイの単位が 1 つで済み、手元・dev・prod の動作の差が小さく、費用も抑えられる。VOICEVOX の接続先は環境変数 `VOICEVOX_URL` で差し替えられるので、別のサービスに分けるときも、クライアントを変えずに済む。同居の代償は、スケールするときに Next.js と VOICEVOX が一緒に増えることで、これは許容している
- `livetalk-web` は、`voicevox` が `HEALTHY` になってから起動する。先に起動すると、最初の音声合成の呼び出しで VOICEVOX につながらず失敗する
- ALB への登録は、コンテナとポートを明示する。指定しないと、最初に追加したコンテナが選ばれ、複数のコンテナがあるタスクで `voicevox` のポート 50021 がターゲットになる。そうなると、ALB のヘルスチェックが `voicevox` に向かい、すべてのタスクが異常になって再起動を繰り返す
- VOICEVOX のイメージは digest で固定する。タグは外部で別のイメージに差し替えられることがあり、デプロイしていなくても、タスクの作り直しで新しいイメージを取得してしまう。タグは版を読み取るためだけに併記する (digest があると pull はタグを見ない)
- `VV_CPU_NUM_THREADS` は環境変数で渡す。起動のコマンドに `--cpu_num_threads` を渡す方法は、コマンドの上書きの影響でコンテナが終了コード 2 で起動に失敗したため
- タスクのサイズは環境ごとに変える。Fargate の組み合わせの制約で、CPU 2,048 のメモリは 4,096〜16,384 MB、CPU 1,024 は 2,048〜8,192 MB なので、メモリだけを単独では下げられない
    - prod は 2,048 / 4,096。実測のピークは CPU 877 units、メモリ 690 MB で、このピークは会話 1 回そのものである。割当を 1,024 に下げると、会話中にほぼ使い切る
    - dev は 1,024 / 2,048。実測のピークは CPU 289 units (2,048 の 14.1%)、メモリ 422 MB (4,096 MB の 10.3%) で、この割当にも余裕がある
- 起動の時間を決めるのは、VOICEVOX のモデルのロードではなく、イメージの pull である。実測 (prod のタスク) では、起動の 81.6 秒の内訳は、イメージの pull が 37.5 秒、ヘルスチェックのポーリングの待ち、`livetalk-web` の起動である。VOICEVOX のエンジンは、既定で全話者のモデルをロードせず、話者ごとに遅れてロードするので、短い時間で HTTP に応答でき、メモリのピークが 690 MB に収まっていることとも合う。起動を短くするには、`startPeriod` ではなく pull の時間が効く
- dev は Fargate Spot で費用を抑える。中断されても、サービスが自動でタスクを立て直す。prod は、利用中の中断を避けるため、オンデマンドにする
- ALB のアイドルタイムアウトを 120 秒にする。LLM の応答をストリーミングで返すので、応答の間に長い無通信の時間が生じうる
- ALB はサービスごとに持つ。クラスターは費用がかからず共有の副作用もないので、共有する ([共有 ECS クラスター](../../../../platform/specs/resource/ecs-cluster.md))。ALB は、アイドルタイムアウトや TLS をサービスごとに調整できるほうがよく、LiveTalk の LLM のストリーミングには長いアイドルタイムアウトが要る。ターゲットグループ・リスナー・タスク定義・サービスも、サービスごとに持つ
- `NODE_ENV` には、`development` ではなく環境名 (`dev` / `prod`) を渡す。共通ライブラリのクッキー名の接尾辞とドメインの範囲を、Auth が発行するクッキーとそろえるため
- `LIVETALK_ENV` と `NAGIYU_ENV` を別に持つのは、`next start` が `NODE_ENV` を `production` に上書きし、デプロイしたあとの dev と prod の判定に使えないため
- `AUTH_SECRET`・OpenAI API キー・VAPID キーは、`environment` ではなく `secrets` で渡す。`environment` に平文を入れると、CloudFormation のテンプレートとタスク定義に値が残り、`aws ecs describe-task-definition` で読め、タスク定義のリビジョンのたびに複製される。`secrets` なら、タスク定義には ARN の参照だけが残る。シークレットは、このスタックでは作らず、名前で取り込む (作ると、入れた値を上書きしてしまう)

## 手順

### VOICEVOX の版を上げる

1. `infra/livetalk/lib/ecs-service-stack.ts` の `voicevox` のイメージを、新しい版のタグと digest に差し替える。タグだけを変えない (digest が変わらないと、新しい版は使われない)
2. dev にデプロイし、`voicevox` のヘルスチェックが通って、タスクが `HEALTHY` で安定するのを確かめる
3. 確かめてから、prod へ進める
