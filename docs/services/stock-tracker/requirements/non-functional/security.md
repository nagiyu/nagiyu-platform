---
sources: []
---

# セキュリティ

利用者の個人情報と、外部 API の資格情報の扱いの水準。Web Push の購読と、外部 API のキーを対象にする。

## 要求水準

- **利用者ごとの分離**: [アクセス制御](../functional/access-control.md)に従う
- **ログに個人情報を出さない**: 購読の `endpoint` や鍵を、ログに出さない。一時通知の失効は購読を読まず、通知の送信は購読の中身をログに出さない
- **外部 API キーの扱い**: 外部 API (Finnhub など) のキーは、Secrets Manager で管理し、実行環境へ注入する ([シークレット](../../specs/resource/secrets.md))

## やらないこと

なし
