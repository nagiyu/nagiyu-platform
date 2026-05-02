---
title: 'AWS SES でトランザクションメールを送る：認証・到達率・運用'
description: 'AWS SES（Simple Email Service）でユーザー登録確認・パスワードリセット・通知などのトランザクションメールを送る実装方法を解説。SPF/DKIM/DMARC の設定・送信制限解除・バウンス処理まで実運用観点で整理します。'
slug: 'aws-ses-transactional-mail'
publishedAt: '2026-04-16'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['AWS', 'SES', 'メール', '到達率']
---

## はじめに

サービスを運用する上で「メール送信」は避けて通れません。ユーザー登録確認・パスワードリセット・通知メールなどのトランザクションメールを安定して届けるには、SES の設定だけでなく **DNS と認証**を整える必要があります。本記事では nagiyu-platform の実装をベースに整理します。

## SES 開始時のサンドボックス

新規アカウントの SES は **サンドボックスモード**から始まります。

- 検証済みアドレス / ドメインへのみ送信可能
- 24 時間で 200 通、1 秒 1 通の制限

本番運用では「**サンドボックス解除申請**」が必要です。AWS Support から「想定送信ボリューム」「コンテンツ種類」「バウンス処理方針」を伝えると、通常 24 時間以内に解除されます。

## ドメインの認証（SPF / DKIM / DMARC）

### SPF（Sender Policy Framework）

ドメインの TXT レコードに「このドメインから送信を許可される送信元 IP」を宣言します。

```
v=spf1 include:amazonses.com ~all
```

`include:amazonses.com` で SES の送信元 IP を許可。`~all` は「リスト外は SoftFail」、より厳しくするなら `-all`（HardFail）。

### DKIM（DomainKeys Identified Mail）

SES コンソールで「Easy DKIM」を有効にすると、3 つの CNAME レコードが提示されます。これを DNS に登録すると、自動的に署名が付与されます。

```
xxx._domainkey.nagiyu.com.   CNAME   xxx.dkim.amazonses.com.
yyy._domainkey.nagiyu.com.   CNAME   yyy.dkim.amazonses.com.
zzz._domainkey.nagiyu.com.   CNAME   zzz.dkim.amazonses.com.
```

DKIM があると、受信側でメールが改ざんされていないことを検証でき、Gmail や Outlook での迷惑メール判定が大幅に下がります。

### DMARC

SPF と DKIM の結果に応じた「拒否ポリシー」を宣言。

```
_dmarc.nagiyu.com.   TXT   "v=DMARC1; p=none; rua=mailto:dmarc@nagiyu.com"
```

最初は `p=none`（観測のみ）で運用し、レポートで問題が無いことを確認してから `p=quarantine` → `p=reject` と段階的に強化します。

## メール送信の実装

```typescript
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({ region: 'ap-northeast-1' });

export async function sendVerificationEmail(to: string, code: string) {
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: 'no-reply@nagiyu.com',
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: 'メールアドレスの確認', Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: `以下のコードを入力して認証を完了してください：\n\n${code}\n\n10 分以内に入力してください。`,
              Charset: 'UTF-8',
            },
            Html: {
              Data: `<p>以下のコードを入力して認証を完了してください：</p><p style="font-size:24px;font-weight:bold">${code}</p>`,
              Charset: 'UTF-8',
            },
          },
        },
      },
    })
  );
}
```

`sesv2` は新しい API で、テンプレートやリスト送信などが整理されています。新規プロジェクトはこちらを推奨。

## バウンス・苦情の処理

到達率を維持するには、**バウンス（届かなかった）と苦情（迷惑メール報告）を即時にキャッチして送信先リストから除外**する必要があります。

### SNS 経由でイベントを受け取る

```hcl
resource "aws_sesv2_configuration_set" "main" {
  configuration_set_name = "nagiyu-default"
}

resource "aws_sesv2_configuration_set_event_destination" "sns" {
  configuration_set_name = aws_sesv2_configuration_set.main.configuration_set_name
  event_destination_name = "bounce-complaint"
  event_destination {
    matching_event_types = ["BOUNCE", "COMPLAINT", "REJECT"]
    sns_destination {
      topic_arn = aws_sns_topic.bounce.arn
    }
  }
  enabled = true
}
```

SNS → Lambda で受信し、DB のユーザーに「メール送信停止」フラグを付ける、というパイプラインが定型です。

```typescript
export async function handler(event: SNSEvent) {
  for (const record of event.Records) {
    const msg = JSON.parse(record.Sns.Message);
    if (msg.eventType === 'Bounce' && msg.bounce.bounceType === 'Permanent') {
      await markEmailUnsendable(msg.mail.destination[0]);
    }
  }
}
```

恒久的バウンス（メールアドレスが存在しない等）を放置すると、AWS 側で送信停止される可能性があります。

## 送信レピュテーション

SES コンソールに「**バウンス率**」「**苦情率**」のメトリクスがあります。

- バウンス率 5% を超えると警告、10% で送信停止
- 苦情率 0.1% を超えると警告、0.5% で送信停止

これらを CloudWatch Alarm で監視し、Slack に通知するようにしておきます。トランザクションメール（ユーザーが期待しているメール）はバウンス率が低いはずですが、マーケティング配信を混ぜると数値が悪化します。

## トランザクションとマーケティングを分ける

「重要メール」と「キャンペーンメール」を同じドメインで送ると、レピュテーション悪化が両方に波及します。

- 例: `no-reply@nagiyu.com`（トランザクション）
- 例: `news@news.nagiyu.com`（マーケティング、サブドメイン分離）

サブドメインを分けると、DKIM / DMARC も別管理になり、片方の評判が下がっても本流に影響しません。

## 料金

- **送信**: \$0.10 / 1,000 通
- **受信**: \$0.10 / 1,000 通
- **データ転送**: 1 GB あたり \$0.12

月 10 万通でも \$10 程度。SendGrid や Mailgun と比べてかなり安いです。

## ハマりどころ

- **From アドレスのドメインが未検証**: 送信時に `MessageRejected` エラー。SES コンソールでドメイン認証を確認。
- **本番リージョンと SES の検証リージョンが違う**: SES は **リージョンごとに独立**。`us-east-1` で検証して `ap-northeast-1` から送信、はできない。
- **24 時間制限の見落とし**: サンドボックスモードのまま大量送信を試して 200 通でエラー。先に解除申請。
- **HTML メールのテンプレ崩れ**: Gmail / Outlook / Apple Mail で挙動が違う。CSS は inline、画像は CID 埋め込みかフル URL に。
- **タイムアウト**: SES API のデフォルトタイムアウトは 30 秒。Lambda タイムアウトとの整合に注意。

## まとめ

AWS SES は格安かつスケーラブルなメール送信基盤ですが、到達率を保つには **DNS 認証（SPF/DKIM/DMARC）+ バウンス処理 + サブドメイン分離** の 3 点を押さえる必要があります。これらを最初に整備しておけば、ユーザー数が増えても安定してメールを届けられます。
