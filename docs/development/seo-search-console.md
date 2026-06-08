# SEO: Google Search Console 登録・運用手順

> **注意: 本手順はすべて人力で実施する。Claude は Google Search Console へのアクセス・操作ができないため、以下の作業は人が直接行うこと。**

---

## 前提

- 対象サイト: `https://nagiyu.com`
- サイトマップ: `https://nagiyu.com/sitemap.xml`
- robots.txt: `https://nagiyu.com/robots.txt`

---

## 1. robots.txt / sitemap.xml の構成

### robots.txt

`src/app/robots.ts` で Next.js `MetadataRoute.Robots` を使用して動的生成している。

現在の設定:

- `User-agent: *` に `Allow: /` を設定（全クローラに対してサイト全体を許可）
- `Disallow` は設定なし（全クローラのアクセスを妨げていない）
- `sitemap`: `https://nagiyu.com/sitemap.xml`
- `host`: `https://nagiyu.com`

**AdSense クローラ (`Mediapartners-Google`) に対する個別ルールは存在しない**。全クローラ許可ルールにより AdSense クローラのアクセスは許可されている。

### sitemap.xml

`src/app/sitemap.ts` で Next.js `MetadataRoute.Sitemap` を使用して動的生成している。

含まれるエントリー:

| エントリー種別       | URL パターン                                                         | 備考                                         |
| -------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| 静的ページ           | `/`, `/about`, `/privacy`, `/terms`, `/services`, `/tech`            | 優先度 0.3 〜 1.0                            |
| サービスドキュメント | `/services/{slug}`, `/services/{slug}/guide`, `/services/{slug}/faq` | 全サービス slug × 3 パス                     |
| 技術記事             | `/tech/{slug}`                                                       | `getAllArticles()` の全件                    |
| タグページ           | `/tech/tags/{slug}`                                                  | count >= 2 かつ ASCII スラッグのタグのみ     |
| カテゴリ別ハブ       | `/tech/category/{slug}`                                              | `getAllTechCategoryMetas()` の全件 (A2 対応) |

---

## 2. Google Search Console プロパティ登録

### 2.1 ドメインプロパティの推奨

`nagiyu.com` ドメイン全体（サブドメインを含む）を対象とする **ドメインプロパティ** の使用を推奨する。

URL プレフィックスプロパティ（`https://nagiyu.com/` など）よりも、ドメインプロパティは以下の点で優れている:

- すべてのサブドメイン（`tools.nagiyu.com` 等）をカバーする
- HTTP / HTTPS を区別しない
- サイト全体のインデックス状況を一元管理できる

### 2.2 登録手順

1. [Google Search Console](https://search.google.com/search-console) にアクセスする
2. 「プロパティを追加」をクリックする
3. 「ドメイン」タブを選択し、`nagiyu.com` を入力する
4. 「続行」をクリックする
5. 表示された DNS TXT レコードをコピーする
   - 例: `google-site-verification=XXXXXXXXXXXX`
6. ドメインの DNS 設定画面（Route 53 等）を開き、TXT レコードを追加する
7. DNS 伝播を待ち（最大 48 時間）、Search Console で「確認」をクリックする

### 2.3 URL プレフィックスプロパティ（代替手段）

ドメインプロパティの DNS 確認が難しい場合、URL プレフィックスプロパティを代替として使用できる。

1. 「プロパティを追加」から「URL プレフィックス」を選択する
2. `https://nagiyu.com/` を入力する
3. 「HTML タグ」による確認方法を選択する
4. 表示された `<meta name="google-site-verification" content="XXXX">` タグを確認する
5. `src/app/layout.tsx` の `metadata` オブジェクトに以下を追加する（人力で実施）:

```typescript
export const metadata: Metadata = {
  // 既存の設定...
  verification: {
    google: 'XXXXXXXXXXXX', // Search Console から取得した値
  },
};
```

6. デプロイ後、Search Console で「確認」をクリックする

---

## 3. サイトマップ送信

1. Search Console のプロパティを選択する
2. 左メニューから「サイトマップ」を開く
3. 「新しいサイトマップの追加」に以下を入力する:
   ```
   sitemap.xml
   ```
   （プロパティ URL に連結され `https://nagiyu.com/sitemap.xml` として送信される）
4. 「送信」をクリックする
5. ステータスが「成功しました」になることを確認する

### 送信後の確認

- ステータス: 「成功しました」
- 検出された URL 数が期待値と大きく乖離していないか確認する
- エラーが表示された場合は、ステータス行をクリックして詳細を確認する

---

## 4. インデックス状況の確認方法

### 4.1 URL 検査ツール

1. Search Console の「URL 検査」を開く
2. 確認したい URL を入力する（例: `https://nagiyu.com/tech/some-article`）
3. 「Google インデックス」欄でインデックス状況を確認する
4. インデックス未登録の場合は「インデックス登録をリクエスト」をクリックする

### 4.2 カバレッジレポート

1. Search Console の「インデックス作成」>「ページ」を開く
2. 「インデックスに登録されていない理由」を確認する
3. 主な対応が必要なステータス:
   - **クロール済み - 現在インデックス未登録**: Google がクロールしたが、価値が低いと判断している
   - **検出済み - 現在インデックス未登録**: クロールキューに入っているが、まだ処理されていない
   - **リダイレクト**: 意図しないリダイレクトが発生していないか確認する

### 4.3 検索パフォーマンス

1. Search Console の「検索パフォーマンス」を開く
2. クリック数・表示回数・CTR・平均掲載順位を確認する
3. 「ページ」タブで各 URL のパフォーマンスを確認する

---

## 5. AdSense との連携確認

### 5.1 AdSense クローラのアクセス確認

1. Search Console の「設定」>「クロール統計情報」を開く
2. `Mediapartners-Google`（AdSense クローラ）のアクセスログを確認する
   - ※ Search Console では Googlebot のみ表示されることが多い
3. AdSense 管理画面にログインし、「サイト」>「サイトの確認」を確認する

### 5.2 robots.txt のテスト

1. Search Console の「設定」>「robots.txt」を開く
2. 「テスト」タブで任意の URL と User-agent を指定して確認できる
3. `Mediapartners-Google` で主要 URL（`/`, `/tech/`, `/services/`）を確認し、「クロール可」になっていることを確認する

---

## 6. 実施後チェックリスト

以下をすべて確認してから完了とする。

- [ ] Search Console プロパティが「確認済み」になっている
- [ ] サイトマップ送信のステータスが「成功しました」になっている
- [ ] サイトマップで検出された URL 数が 0 でない
- [ ] URL 検査でトップページ（`https://nagiyu.com/`）がインデックス済みになっている
- [ ] robots.txt テストで `Mediapartners-Google` が主要 URL にアクセス可であることを確認した
- [ ] AdSense 管理画面でサイトが「確認済み」の状態になっている

---

## 7. トラブルシューティング

### サイトマップが「取得できません」になる

- `https://nagiyu.com/sitemap.xml` に実際にアクセスして XML が返ることを確認する
- デプロイが完了しているか確認する

### インデックスが増えない

- クロール頻度が低い場合、「URL 検査」>「インデックス登録をリクエスト」を主要 URL に対して実施する
- コンテンツの品質・E-E-A-T（経験・専門性・権威性・信頼性）を見直す

### AdSense 審査が通らない

- コンテンツが「有用性の低いコンテンツ」と判定される場合、記事の質・量を改善する
- AdSense ポリシー違反がないか確認する
- 申請から審査完了まで数日〜数週間かかることがある

---

## 関連ドキュメント

- [Portal アーキテクチャ](../../services/portal/architecture.md) - AdSense 対応の経緯・ADR-001
- [Portal 要件定義書](../../services/portal/requirements.md) - ビジネスゴール
- [SEO 再検証メモ](./seo-revalidation-notes.md) - C-2 で追加したメタデータ・sitemap 検証ユーティリティの使い方（integration マージ後に参照可能）
