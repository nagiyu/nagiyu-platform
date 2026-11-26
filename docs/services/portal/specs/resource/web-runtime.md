---
sources:
  - infra/root/portal-lambda-stack.ts
  - infra/root/ecs-cluster-stack.ts
  - infra/root/alb-stack.ts
  - infra/root/ecs-service-stack.ts
  - infra/common/src/utils/ssm.ts
  - services/portal/web/Dockerfile
  - .github/workflows/root-deploy.yml
  - services/portal/web/src/app/layout.tsx
sources_hash: 0963f6df356a0acc6c2cb90c65ef228126bf93d00088c027163f3bfea2241e59
---

# Web の実行環境

Next.js の Web を動かす実行環境。dev は Lambda 関数 (Function URL)、prod は ECS (Fargate) のタスクで、前段に ALB と専用の ECS クラスターを置く。どちらも ECR の同じ形のイメージから動く。

## リソース

| 環境 | 名前 | 種類 | 用途 |
|---|---|---|---|
| dev | `nagiyu-portal-lambda-dev` | Lambda 関数 (ECR イメージ) | Web 本体 |
| dev | Function URL | Lambda の Function URL | 関数の公開の入口。前段の CloudFront から呼ばれる ([デプロイ先](../deploy.md)) |
| dev | 実行ロール (名前は CDK が決める) | IAM ロール | 関数の実行ロール |
| dev | `/aws/lambda/nagiyu-portal-lambda-dev` | CloudWatch Logs のロググループ | 関数のログ |
| prod | `nagiyu-root-cluster-prod` | ECS クラスター | Portal 専用のクラスター |
| prod | `nagiyu-root-alb-prod` | ALB (インターネット向け) | CloudFront からの入口 |
| prod | `nagiyu-root-tg-prod` | ターゲットグループ | ECS のタスクへ転送する先 |
| prod | `nagiyu-root-service-prod` | ECS サービス (Fargate) | Web 本体 |
| prod | `nagiyu-root-task-prod` | ECS のタスク定義 (コンテナ名 `portal-app`) | イメージと CPU・メモリの定義 |
| prod | `/ecs/nagiyu-root-task-prod` | CloudWatch Logs のロググループ | タスクのログ |
| prod | セキュリティグループ 2 つ (ALB 用、タスク用) | EC2 セキュリティグループ | 通信の許可 |
| prod | タスク実行ロール、タスクロール (名前は CDK が決める) | IAM ロール | イメージの取得とログの書き込み、アプリの実行 |

`prod` の ECS の資材は、スタックの定義上は環境名を名前に含む (`-{env}`) が、作るのは prod だけである。dev は ALB と ECS を使わない。スタックは[デプロイ先](../deploy.md)の「スタック」にある。イメージの置き場の ECR と前段の CloudFront も同じ表にある。

## 設定値

### dev: Lambda

名前と、関数の既定値は [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。Portal の差分だけを示す。

| 項目 | 値 | 共通部品の既定との違い |
|---|---|---|
| メモリ | 1024 MB | 既定は 512 MB |
| タイムアウト | 30 秒 | 同じ |
| Function URL の認証 | AWS_IAM。直接呼ぶと 403 になる | 同じ |
| Function URL の CORS | すべてのオリジン・メソッド・ヘッダーを許可 | 同じ値を明示している |
| ロググループ | 新しく作らず、既存のものを引き継ぐ (`adoptExistingLogGroup`) | 既定は作る |
| エラー履歴への書き込み | なし | 基底の既定どおり |

- 表にない項目 (アーキテクチャ、X-Ray、ログの保持期間、イメージのタグ、タグ、CloudFront からの呼び出しの許可) は既定値のまま
- `adoptExistingLogGroup` を付けるのは、CloudFormation の管理外に同名のロググループがすでにあり、ロググループを作ると名前が衝突するため。この関数が既存だから付けているもので、新しい関数は付けない ([Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の「ロググループ」)

### prod: ECS のタスクとサービス

| 項目 | 値 |
|---|---|
| CPU | 256 (0.25 vCPU) |
| メモリ | 512 MiB |
| コンテナのポート | 3000 (TCP) |
| 希望するタスク数 (`desiredCount`) | 1 |
| 配置するサブネット | VPC のパブリックサブネット |
| パブリック IP | 付ける |
| ヘルスチェックの猶予 (`healthCheckGracePeriod`) | 60 秒 |
| コンテナのヘルスチェック | なし。ALB のターゲットのヘルスチェックだけで見る |
| イメージ | `nagiyu-portal-ecr-prod` の、環境変数 `IMAGE_TAG` のタグ |
| ログの保持期間 | 1 週間。スタックを消すと、ロググループも消える |
| タスク用セキュリティグループの受信 | ALB のセキュリティグループから、TCP 3000 だけ |
| タスク実行ロールの権限 | `AmazonECSTaskExecutionRolePolicy` と、この ECR リポジトリからのイメージの取得 (`BatchCheckLayerAvailability`、`GetDownloadUrlForLayer`、`BatchGetImage`)、`ecr:GetAuthorizationToken` (対象を絞れないので全体) |
| タスクロールの権限 | なし |

- クラスターは SSM パラメータから名前を読んで取り込む。ALB のセキュリティグループとターゲットグループも同じで、スタックどうしの直接の依存を持たない。取り込む名前は下の「SSM パラメータ」にある
- タスクが AWS のリソースを呼ぶ権限を持たないのは、Portal がデータベースも外部の API も持たないため

### prod: ALB

| 項目 | 値 |
|---|---|
| 配置するサブネット | VPC のパブリックサブネット |
| ALB の受信 | 任意の IPv4 から TCP 80 |
| リスナー | HTTP 80。ターゲットグループへ転送する (既定のアクション) |
| ターゲットグループのポート・プロトコル | 3000、HTTP。ターゲットの種類は IP |
| ターゲットのヘルスチェック | `/api/health` ([システム系の API](../api/system.md))、HTTP |
| ヘルスチェックの間隔・タイムアウト | 30 秒・5 秒 |
| 正常・異常と判断する連続回数 | 2 回・2 回 |
| 登録解除の待ち (`deregistrationDelay`) | 30 秒 |

### prod: ECS クラスター

| 項目 | 値 |
|---|---|
| 名前 | `nagiyu-root-cluster-{env}` |
| キャパシティープロバイダー | `FARGATE`、`FARGATE_SPOT` |
| 既定のキャパシティープロバイダー戦略 | なし |
| Container Insights | 無効 |

共有の ECS クラスターと同じ設定で、理由もそちらにある ([共有 ECS クラスター](../../../../platform/specs/resource/ecs-cluster.md))。Portal の prod は、共有のクラスターではなく、このクラスターを使う。

### SSM パラメータ

ALB とクラスターのスタックが書き、ECS サービスのスタックが読む。名前の定義は `infra/common/src/utils/ssm.ts` の `SSM_PARAMETERS` にある。

| SSM パラメータ | 値 |
|---|---|
| `/nagiyu/root/{env}/alb/dns-name` | ALB の DNS 名 |
| `/nagiyu/root/{env}/alb/arn` | ALB の ARN |
| `/nagiyu/root/{env}/alb/target-group-arn` | ターゲットグループの ARN |
| `/nagiyu/root/{env}/alb/security-group-id` | ALB のセキュリティグループの ID |
| `/nagiyu/root/{env}/ecs/cluster-name` | クラスターの名前 |
| `/nagiyu/root/{env}/ecs/cluster-arn` | クラスターの ARN |

## 環境変数

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `NODE_ENV` | Node.js の実行モード | dev (Lambda): 環境名そのもの (`dev`)。prod (ECS): `production`。ECS のスタックは、環境が prod 以外なら `development` を入れる。イメージ自体は `production` を設定しており、Lambda と ECS の指定がそれを上書きする |
| `PORT` | アプリが待ち受けるポート | イメージが `3000` を設定する。ECS は同じ値を明示する |
| `NAGIYU_ENV` | デプロイ先の環境名 (`dev` / `prod`)。広告の出し分けに使う | ビルド時の Docker の build-arg。値は `.github/workflows/root-deploy.yml` が、デプロイ先の環境名を渡す。イメージの実行時の環境変数にも同じ値が残る |
| `APP_VERSION` | フッターに出すバージョン | ビルド時の Docker の build-arg。値は `services/portal/web/package.json` の `version`。なければ `1.0.0` |
| `NEXT_TELEMETRY_DISABLED` | Next.js のテレメトリの無効化 | イメージが `1` を設定する |

- 広告を読み込むかは `NAGIYU_ENV` で決める (条件は[ホーム画面](../screen/home.md)の「全画面で共通の部分」、理由は[広告](../../requirements/functional/ads.md))。`NODE_ENV` では判定できない。`next build` は環境にかかわらず常に `NODE_ENV=production` で動くため、dev と prod を区別できない
- `NAGIYU_ENV` と `APP_VERSION` は、画面をビルド時に作る (SSG) ので、ビルドのときの値で決まる。デプロイ後に環境変数を変えても、作られた画面は変わらない。動的に描くルートでもビルド時と同じ判定になるよう、実行時の環境にも `NAGIYU_ENV` を残している
- シークレットを持たない。値はすべて環境名とバージョンで、秘匿するものはない

## 理由

- prod は ECS の常時稼働のタスクで動かす。コールドスタートを避けるためで、理由の詳細は[デプロイ先](../deploy.md)の「理由」にある

## 手順

Core Web Vitals を測る手順。基準値は[性能](../../requirements/non-functional/performance.md)にある。測る対象のページは、`/`、`/tech`、`/tech/{slug}` (記事 1 本)、`/about`。

### PageSpeed Insights (推奨)

1. [PageSpeed Insights](https://pagespeed.web.dev/) で、測るページの URL を入れて「分析」する。デプロイ済みのページだけ測れる。本番は `https://nagiyu.com`、dev は `https://dev.nagiyu.com`
2. 「モバイル」と「デスクトップ」の両方を測る。Google は主にモバイルを評価の基準にする
3. 「フィールドデータ」(実際の利用者のデータ) と「ラボデータ」(シミュレーション) の両方を見る。アクセスが少ないと、フィールドデータは出ないことがある

### Chrome DevTools の Lighthouse (手元)

1. リポジトリのルートで、共通ライブラリを一度ビルドする

    ```bash
    npm run build:libs
    ```

2. `services/portal/web` で起動する

    ```bash
    cd services/portal/web
    npm run dev
    ```

3. Chrome で `http://localhost:3000` を開き、DevTools (F12) の「Lighthouse」タブで「モバイル」か「デスクトップ」を選び、「レポートを生成」する

手元と本番の違い。

- 手元では、`NAGIYU_ENV=prod` を付けない限り (ビルドして動かすときは、ビルド時に付ける)、AdSense が読み込まれず、広告のスクリプトの分だけ本番と違う
- `npm run dev` は開発用のサーバーで、本番のビルドとは動き方が違うので、値は本番と一致しない
- サーバーの応答時間は、手元の方が実際より速い

### Lighthouse CLI

Chrome を開かずに、コマンドで測る。

```bash
npx lighthouse http://localhost:3000 --preset=perf --form-factor=mobile --output=html --output-path=./lighthouse-mobile.html
npx lighthouse http://localhost:3000 --preset=perf --form-factor=desktop --output=html --output-path=./lighthouse-desktop.html
```

起動の手順と手元の差は、上の Chrome DevTools と同じ。デプロイ済みのページを測るなら、URL を差し替える。
