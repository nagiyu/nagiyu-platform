---
title: 'EventBridge Rules で定期バッチを CDK で組む：資産・株価管理サービスの 6 ルール構成'
description: 'AWS CDK（aws-events）を使って EventBridge Rules でバッチ定期実行を組む方法を解説。rate() / cron() の使い分け、LambdaFunction target の指定、EventBridge Scheduler との選択判断まで、ある資産・株価管理サービスの実装をベースに紹介します。'
slug: 'eventbridge-rule-scheduling'
publishedAt: '2026-05-27'
updatedAt: '2026-05-27'
author: 'なぎゆー'
tags: ['AWS', 'EventBridge', 'Lambda', 'CDK']
categories: ['aws']
---

## はじめに

AWS で定期実行を組む手段は、大きく 2 つあります。

- **EventBridge Rules**（`aws-cdk-lib/aws-events`、旧 CloudWatch Events）
- **EventBridge Scheduler**（2022 年 11 月リリース、`@aws-cdk/aws-scheduler-alpha` 等）

Scheduler は後発だけあって機能が豊富です。タイムゾーン指定、One-time（特定時刻 1 回）実行、スケジュール数の大幅緩和（1 アカウントあたり数百万件）、スケジュールごとの DLQ 設定など、使い込むサービスには向いています。

一方、**シンプルな定期バッチに限れば Rules は今も現役**です。本記事では、個人開発で運用しているある資産・株価管理サービスの 6 つのバッチルールを AWS CDK（`aws-events` + `aws-events-targets`）で実装した構成を解説します。

## EventBridge Rules の基本

CDK での Rule 定義は `events.Rule` を使います。

```typescript
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

const rule = new events.Rule(this, 'MyRule', {
  ruleName: 'my-service-batch',
  description: 'Trigger MyBatch every 1 hour',
  schedule: events.Schedule.rate(cdk.Duration.hours(1)),
});
rule.addTarget(new targets.LambdaFunction(myLambdaFunction));
```

### スケジュール式の 2 種類

**rate 式** — 一定間隔で繰り返す場合に使います。

```typescript
events.Schedule.rate(cdk.Duration.minutes(1)); // 1 分ごと
events.Schedule.rate(cdk.Duration.hours(1)); // 1 時間ごと
```

`cdk.Duration` を使うことで、秒数の計算ミスが起きにくくなります。

**cron 式** — 特定の時刻・曜日を指定する場合に使います。

```typescript
events.Schedule.cron({
  minute: '0',
  hour: '0',
  day: '*',
  month: '*',
  year: '*',
});
```

EventBridge の cron は **UTC 固定**です。`hour: '0'` は UTC 0:00 を意味します。Scheduler と異なりタイムゾーン指定はできないため、日本時間で考える場合は 9 時間ずらして計算する必要があります。

## Lambda を target にする

`targets.LambdaFunction` を使うと、Lambda の Invoke 権限付与も CDK が自動で行ってくれます。

```typescript
import * as targets from 'aws-cdk-lib/aws-events-targets';

rule.addTarget(new targets.LambdaFunction(batchFunction));
```

Lambda に JSON を渡したい場合は `event` オプションで指定できます。

```typescript
rule.addTarget(
  new targets.LambdaFunction(batchFunction, {
    event: events.RuleTargetInput.fromObject({ jobType: 'daily-cleanup' }),
  })
);
```

## 実装ノート

この資産・株価管理サービスでは 6 つの EventBridge Rule を 1 つの CDK Stack（`EventBridgeStack`）にまとめています。

| ルール名                      | スケジュール        | 処理内容                         |
| ----------------------------- | ------------------- | -------------------------------- |
| BatchMinuteRule               | `rate(1 minute)`    | MINUTE_LEVEL アラート処理        |
| BatchHourlyRule               | `rate(1 hour)`      | HOURLY_LEVEL アラート処理        |
| BatchSummaryRule              | `rate(1 hour)`      | 日次サマリー生成                 |
| BatchTemporaryAlertExpiryRule | `rate(1 hour)`      | 一時通知アラートの期限切れ無効化 |
| BatchEvaluationRule           | `rate(1 hour)`      | 予測精度の採点                   |
| BatchDailyRule                | `cron(0 0 * * ? *)` | データクリーンアップ（UTC 0:00） |

設計のポイントは「**1 Lambda 1 Rule**」です。`batchHourlyFunction` などはそれぞれ独立した Lambda として定義してあり、Rule も 1 対 1 で対応しています。1 つの Rule に複数の target を bundle するよりも、障害切り分けやログの追跡がずっと楽になります。

Scheduler ではなく Rules を選んだのは、スケジュール数と機能要件を照らし合わせた積極的な判断です。スケジュール本数は 6 本で 300 件の上限に対して十分な余裕があり、すべて UTC 固定でタイムゾーン指定も不要、One-time 実行もありません。Scheduler の差分機能がひとつも必要ないと判断できたため、ビルトインの `aws-events` で完結させました。

また、全 Rule に対して Application・Service・Environment の 3 つのタグを一括で付与しています。

```typescript
[minuteRule, hourlyRule, summaryRule, temporaryAlertExpiryRule, evaluationRule, dailyRule].forEach(
  (rule) => {
    cdk.Tags.of(rule).add('Application', 'my-platform');
    cdk.Tags.of(rule).add('Service', 'asset-tracker');
    cdk.Tags.of(rule).add('Environment', environment);
  }
);
```

ルールが増えても配列に追加するだけで漏れなくタグが付くので、コスト配分レポートが常に揃っています。

## ハマったポイント

**1 分ルールの並行実行対策**

`rate(1 minute)` の BatchMinuteRule は、Lambda の処理が 1 分を超えると前回の実行と重複します。EventBridge 側には「前回が終わるまで起動しない」オプションがないため、Lambda の handler 冒頭で DynamoDB に処理中フラグを書き込み、二重起動をブロックする実装にしています。

**1 時間ルールが 4 本ある理由**

Hourly / Summary / TemporaryAlertExpiry / Evaluation はすべて `rate(1 hour)` です。これを「1 つの Rule から 4 つの Lambda を呼ぶ」構成にする案もありましたが、1 Rule あたりの target 上限は 5 で、かつ CloudWatch Logs でのフィルタリングが Rule 単位になるため可読性が落ちます。Rule を分けることでログの追跡と個別のテスト有効化・無効化が簡単になりました。

## 現在の運用

cron 式の変更は CDK でのコード修正→デプロイだけで反映されます。コンソール操作が不要なため、「いつ・誰が・どう変えたか」が Git 履歴に残ります。本番環境での深夜バッチの時間を調整するときも、PR レビューを経てデプロイできるのは安心感があります。

Rule の有効・無効切替も CDK の `enabled` プロパティで制御できます。

```typescript
const rule = new events.Rule(this, 'BatchMinuteRule', {
  schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
  enabled: props.environment !== 'local', // ローカル環境ではオフ
});
```

現在は `environment` パラメータを環境ごとに切り替えることで、ローカルやステージング環境での意図しないバッチ起動を防いでいます。

## まとめ

EventBridge Rules と Scheduler は競合というより補完関係です。スケジュール本数が少なく UTC で完結するシンプルな定期実行なら、追加依存なしで使える `aws-events` の Rules が選択肢として十分成立します。CDK との親和性も高く、コードレビューと Git 管理の中に定期実行の設計を自然に組み込めるのが大きな利点です。
