---
sources: []
---

# エラーの収集

各サービスの失敗を ErrorEvent として共通の保存先に集め、あとから見られるようにする。ユースケースは[エラーが記録されると Push が届く](../use-cases/receive-error-notification.md)。

## 要件

- 失敗を、3 つの信号から ErrorEvent として記録できる ([エラー通知の経路](../../specs/flow/error-notification.md)、[ErrorEvent](../../../../platform/specs/term/error-event.md))
    - アプリの報告: 各サービスが、自分の失敗を報告する
    - CloudWatch Alarm: 各サービスのアラームが ALARM になったとき ([alarm-ingest](../../specs/batch/alarm-ingest.md))
    - AWS Batch のジョブ失敗: ジョブが失敗したとき ([alarm-ingest](../../specs/batch/alarm-ingest.md))
- アプリが自分で報告できない失敗 (処理の即死など) も、CloudWatch Alarm と AWS Batch のジョブ失敗の信号で拾える
- 記録は、サービスをまたいで 1 つの保存先に集め、一定期間で自動で消える。履歴の見方は[エラーの履歴](error-history.md)
- 取り込み (alarm-ingest) とテーブルの障害は、自己監視で運用者に届く ([自己監視](self-monitoring.md))
- アプリの報告の保存に失敗しても、報告したアプリの本来の処理は止めない

## やらないこと

- **同じ失敗の重複の除去**: 理由は[目的](../purpose.md)の「扱わない範囲」を参照
- **アプリの報告が保存に失敗したことの通知**: アプリの報告の保存に失敗する (権限がない、テーブル名の環境変数がないなど) と、ログに残るだけで、運用者には通知しない。報告の失敗でアプリの本来の処理を止めないよう、報告の側は失敗を例外にしないため ([エラーの報告](../../../../platform/specs/lib/aws/error-reporting.md)の理由)
- **アラームの回復の記録**: アラームが OK や INSUFFICIENT_DATA に戻ったことは記録しない。運用者に知らせるのは、異常への遷移だけにするため
