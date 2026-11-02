# サブスクリプション課金の土台 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/auth/architecture.md に ADR として抽出し、
    tasks/subscription-billing/ ディレクトリごと削除します。

    入力: tasks/subscription-billing/requirements.md
    実装タスクのフェーズ分け・進捗管理は Issue 本文 + サブ Issue で行います。
-->

本書は Phase をまたいで守る前提と、Phase 間の取り決めを書く。各 Phase の詳細 (物理設計・画面の細部) は、その Phase で決めて追記する。

## 前提 (調査と準備で分かっていること)

### Stripe の状態

- Stripe のアカウントとサンドボックスは作成済み。dev の検証はサンドボックスで行う。
- 事業者の情報 (公開用の事業者名・サポートの連絡先) は、本番環境を有効化してからでないと設定できない。本番の申請は、全 Phase を本番に出した後に行う。
- Stripe の公式ドキュメントとエージェント向けのスキルがある (`stripe agent setup`)。P2 で使うかはその Phase で判断する。

### Stripe の仕様で設計に効くもの

- **Entitlements**: 商品に「機能」(`lookup_key` を持つ) を紐づけると、契約に応じて有効な機能の一覧を Stripe が管理する。`GET /v1/entitlements/active_entitlements?customer=` で照会でき、変化すると `entitlements.active_entitlement_summary.updated` が通知される。
- **通知の性質**: 配信の順序は保証されず、同じ通知が重複して届くことがある。失敗すると最大 3 日間再送される。署名の検証には、加工していないリクエストの本文が要る。
- **領収書メール**: Stripe が送る領収書には、正式な事業者名 (個人では本名) とサポート用の住所が必ず載る。送信は管理画面の「送信メール → 決済成功時」で切り替えられる。払った本人にだけ見える範囲なので、本名が載ることは許容している。
- **Customer Portal**: 解約 (期間の終わりまで有効)・支払い方法の変更・請求の履歴を Stripe 側で提供する。
- **支払い方法**: 定期課金で使えるのはカード (Apple Pay / Google Pay を含む)。PayPay とコンビニ決済は定期課金に使えない。

### 既存の認証の仕組みで設計に効くもの

- ロールは JWT に載り、`.nagiyu.com` の共有 Cookie で全サービスに伝わる。各サービスは JWT を読むだけで、DB は見ない。
- ロールを DB から読み直すのは auth だけで、契機は 2 つ。auth ドメインへのリクエストで前回から 5 分を超えていたとき、または `/refresh` ページで強制したとき。
- **ロールの剥奪は即時に反映されない**。利用者が auth ドメインを通らない限り、最長でセッションの期限 (30 日) まで古いロールが残る。

## 未決事項 (人と決める)

| # | Phase | 論点 | 候補と推し |
|---|---|---|---|
| D1 | P1 | 課金の権利の期限切れを、auth を通らない利用者にどう効かせるか | 下記「期限切れの扱い」 |
| D2 | P1 | 課金の権利の物理的な置き場所 | ユーザーの項目に足すか、別テーブルか。P1 で決める |
| D3 | P2 | プランの単位 | サービスごとの有料ロールか、全体で 1 つのプランか |
| D4 | P2 | Stripe の通知の受け口の置き場所 | auth の Route Handler か、別の Lambda か |
| D5 | P2 | Stripe 由来の権利の有効期限の決め方 | 下記「Stripe との同期」 |
| D6 | P3 | 表記・料金・規約の文面 | 人が確認して決める |

### 期限切れの扱い (D1)

剥奪が即時に反映されない既存の制約のままだと、解約した人や期限が切れた人が、auth を通らない限り最長 30 日有料ロールを持ち続ける。

- **案 A: 許容する**。作り足しは要らない。漏れはおおむね「解約後にもう 1 か月使える」程度に収まる。
- **案 B: 期限を JWT に載せ、読む側で外す** (推し)。課金の権利のロールに有効期限を添えて JWT に載せ、共通ライブラリのセッション取得で期限切れのロールを取り除く。DB を見ずに期限が効く。
    - 更新されたのに利用者が auth を通っていない場合は、期限でいったんロールが外れる。既存の「アクセスを更新」の導線 (`/refresh`) を通れば戻る。
    - 取り消し (期限前の剥奪) は、案 B でも既存の制約どおり遅れて反映される。

## データモデル

### 論理モデル

名前は仮。P1 で決める。

```typescript
// 課金の権利
type RoleGrant = {
    grantId: string;
    userId: string;
    roleId: string;           // ROLES のキー。有料ロールとしてコードで定義する
    source: 'manual' | 'stripe';
    sourceRef?: string;       // 手動ならメモ、Stripe なら顧客 ID など
    expiresAt?: number;       // 手動では必須
    revokedAt?: number;
    grantedBy?: string;       // 手動で付けた運営者の userId
    createdAt: number;
    updatedAt: number;
};

// 自サービスの利用者と Stripe の顧客の対応 (P2)
type StripeCustomerLink = {
    userId: string;
    stripeCustomerId: string;
};
```

**有効なロール** = 手動ロール ∪ { 取り消されておらず、期限内の課金の権利の `roleId` }

### 物理モデル

P1 (課金の権利) と P2 (Stripe の顧客の対応) で決める。

決めるときの制約:

- 既存のユーザーのテーブルは `userId` だけをキーに持つ (ソートキーなし)。同じキーで別の種類の項目を並べることはできない。
- 有効なロールの算出は、ログインのたびとロールの再取得のたびに走る。そのときの読み取りの回数を増やしすぎない。
- Stripe の通知は顧客 ID を持ってくる。顧客 ID から `userId` を引けるようにする。
- dev では develop の版と integration の版が上書きし合う (requirements の NFR-COMPAT-1)。dev のテーブルは削除設定 (`DESTROY`) なので、作り直しは許容する。

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
|----------|------|
| `libs/common` | 有料ロールの定義 (ROLES)。有効なロールの算出が純粋関数で書けるなら置く |
| `libs/nextjs` | 案 B を採るなら、セッション取得で期限切れのロールを取り除く |
| `services/auth/core` | 課金の権利と Stripe の顧客の対応のリポジトリ。Stripe との同期のロジック |
| `services/auth/web` | jwt callback での有効なロールの算出、管理画面、プランの画面、申し込み・契約の管理・通知の受け口の API |
| `infra/auth` | テーブル、Stripe の鍵の秘密情報、通知の受け口への経路 |
| `services/portal/web` | 料金・特定商取引法に基づく表記・規約の更新 |

### Phase 間の取り決め

- **P1 → P2**: 課金の権利を書き換える操作は、P1 で `source` を問わず使える形にしておく。P2 は新しい保存先を作らず、`source: 'stripe'` の権利として同じところへ書く。
- **ロール名の一致**: Stripe の Entitlements の `lookup_key` は、有料ロールの ID と同じ文字列にする。対応表を持たずに済み、プランと有料ロールの対応を Stripe の管理画面で変えられる (NFR-EXT-2)。
- **決済直後の反映**: Checkout の成功時の戻り先を、auth の `/refresh?callbackUrl=<元の画面>` にする。新しい仕組みは作らない (F-007)。

### Stripe との同期 (P2)

通知の中身は「この顧客の何かが変わった」という合図としてだけ使い、毎回 Stripe に最新の状態を問い合わせて上書きする。

1. 署名を検証する。
2. 通知から顧客 ID を取り出し、`userId` を引く。
3. その顧客の有効な Entitlements (または契約) を Stripe から取得する。
4. 得られた `lookup_key` の集合に合わせて、`source: 'stripe'` の課金の権利を作る・期限を更新する・取り消す。
5. 成功を返す。

この形なら、重複・順序の入れ替わり・取りこぼし後の再送のいずれでも、最終的に Stripe の状態と一致する。通知の ID を記録して重複を除く仕組みは、原則要らない。

**Stripe 由来の権利の有効期限 (D5)** は、案 B を採るなら必要になる。たとえば「現在の請求期間の終わり + 数日の猶予」にし、更新の通知のたびに延ばす。猶予は、支払い失敗の再試行の期間との兼ね合いで P2 で決める。

### API (P2、仮)

| メソッド | パス | 説明 | 認証 |
|---------|------|------|------|
| POST | `/api/billing/checkout` | Checkout Session を作り、その URL を返す。有効な契約があれば作らない | セッション必須 |
| POST | `/api/billing/portal` | Customer Portal のセッションを作り、その URL を返す | セッション必須 |
| POST | `/api/billing/webhook` | Stripe からの通知を受ける | Stripe の署名 |

- Checkout Session には、顧客 (なければ作って対応を保存する)、`client_reference_id` と `metadata` の `userId` を付ける。
- 通知の受け口は、ログインを求めるミドルウェアの対象から外す。

## 実装上の注意点

### 依存関係・前提条件

- P2 は P1 の課金の権利に依存する。P3 は独立して進められる。
- dev の検証には Stripe のサンドボックスの鍵が要る。鍵は人が Stripe の管理画面で発行して、秘密情報に登録する。

### セキュリティ考慮事項

- 課金の権利の手動変更の API は、既存のロール割り当てと同じ権限 (`roles:assign`) で守る。
- Stripe の秘密鍵と通知の署名鍵は、既存の秘密情報と同じ方法 (Secrets Manager → CDK の context → Lambda の環境変数) で扱う。
- 通知の受け口の前にある CloudFront と Lambda の経路で、本文が加工されずに届くか、`Stripe-Signature` ヘッダーが転送されるかを dev で確かめる。
- 削除されずに残る設定で名前が固定のリソース (秘密情報など) は、dev で develop の版と行き来すると、作り直しのときに名前の衝突で失敗しうる。作るときに確かめる。

## docs/ への移行メモ

- [ ] `docs/services/auth/requirements.md` に統合すること: 課金の権利・申し込み・契約の管理・通知の反映のユースケースと機能要件
- [ ] `docs/services/auth/architecture.md` に ADR として追記すること: 課金をロールの入口として扱う (external-design の ADR-001)、課金の権利を手動ロールと分ける (ADR-002)、Stripe を主軸にし販売代行型を使わない (ADR-003)、通知を合図として扱い毎回取り直す同期、D1 で決めた期限切れの扱い
- [ ] `docs/development/authentication.md` を更新すること: 有効なロールの算出、D1 で案 B を採った場合の期限の扱い
- [ ] `docs/services/auth/roles-and-permissions.md` を更新すること: 有料ロールの定義
- [ ] `docs/services/portal/external-design.md` に統合すること: 料金と特定商取引法に基づく表記のページ
