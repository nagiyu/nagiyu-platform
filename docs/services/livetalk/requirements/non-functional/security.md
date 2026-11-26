---
sources: []
---

# セキュリティ

リブトーク固有の保護の水準。ログインの構成は[認証の規約](../../../../platform/rules/authentication.md)、XSS などは[セキュリティの規約](../../../../platform/rules/security.md)に従う。

## 要求水準

- ログインは Google アカウントで、Auth のシングルサインオンに任せる。リブトークは専用のログインを持たない ([サインイン](../../../auth/requirements/functional/sign-in.md))
- 権限で、使える機能を分ける ([権限とロール](../../specs/term/permission.md))
    - 画面 (規約・プライバシーポリシーと、権限なしの画面を除く) と、会話・記憶・ノート・同意・通知・退会の API は、`livetalk:chat` が要る。未ログインは Auth のサインインへ移し、権限がなければ拒否する
    - ステータス画面と、テスト通知の送信は、`livetalk:admin` が要る
- 秘密は、Secrets Manager に置き、リポジトリに置かない。対象は、認証の署名鍵、OpenAI の API キー、Web Push の VAPID の鍵である。注入の方法は[シークレット](../../specs/resource/secrets.md)にある
    - VAPID の秘密鍵は、サーバーだけが持つ
- データは、DynamoDB の暗号化を有効にして保存する
- 計測のログとメトリクスには、会話の本文を含めない。トークン数、遅延、件数だけを記録する
- 利用者の発言を外部の LLM に渡すこと、会話や記憶として残すことは、利用者の同意を前提にする ([同意](../functional/consent.md))

## やらないこと

なし
