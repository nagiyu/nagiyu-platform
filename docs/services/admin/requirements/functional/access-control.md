---
sources: []
---

# アクセス制御

運用者が使える機能を、持っている権限で分ける。権限がなければ、その機能は使えない。

## 要件

- 機能ごとに、要る権限で分ける。通知の購読の登録と解除は `notifications:write`、エラー履歴の一覧と詳細は `errors:read` が要る。現在、どちらも `admin` ロールだけが持つ ([権限とロール](../../specs/term/permission.md))
- 権限がないときは、その機能の画面と API を使えない。画面は権限がない旨を示し、API は拒否する ([API のエラー応答](../../specs/term/api-error.md))
- ログインしていない利用者の API は、拒否する
- 権限のない機能の入口は、ダッシュボードに出さない ([ダッシュボード画面](../../specs/screen/dashboard.md))
- ロールと権限の定義は、コードで持つ ([ロールと権限](../../../../platform/specs/lib/common/roles-and-permissions.md))

## やらないこと

- **ロールの付け外し**: Admin では行わない。理由は[目的](../purpose.md)の「扱わない範囲」を参照
