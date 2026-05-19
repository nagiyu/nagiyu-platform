## 📝 週次ブログ記事追加

このIssueは自動作成されました。Portal 技術ブログに記事を **1 本**新規追加してください。

## 📋 実行情報

- 作成日時: {{CREATE_TIME}}
- 次回作成予定: {{NEXT_DATE}}

---

## 🎯 テーマ選定

`services/portal/web/src/content/tech/` 配下の既存記事（29 本程度）の frontmatter（`title` / `tags` / `relatedServices`）を一覧し、以下の条件を満たす新規テーマを **1 つ**選定すること。

- 既出テーマと重複しない
- 本リポジトリの技術スタック（AWS / Next.js / TypeScript / CDK / Playwright 等）に沿っている
- 記事として単独で成立する粒度（チュートリアル・設計解説・ハマり事例・比較等）

---

## 📄 記事仕様

**1 Issue につき記事 1 本を新規作成する**（複数本まとめ作成は不可）。

- **ファイルパス**: `services/portal/web/src/content/tech/{slug}.md`（1 ファイルのみ）
- **slug**: ファイル名と frontmatter の `slug` フィールドを一致させる（kebab-case 英字）
- **frontmatter**: 既存記事に準拠する

    ```yaml
    ---
    title: "記事タイトル（日本語可）"
    description: "記事の説明（1〜2文）"
    slug: "kebab-case-slug"
    publishedAt: "YYYY-MM-DD"
    tags:
      - existing-tag
    relatedServices:
      - サービス名
    ---
    ```

- **タグ**: 既存タグと整合させ、`isLinkableTag` 対象の ASCII slug タグを最低 1 つ含める
- **言語**: 日本語で執筆

---

## ✅ 品質基準

- ボリューム: 既存記事と同程度（7〜9 KB 目安）
- 構成: `## はじめに` → 本文各節 → `## まとめ` を基本とする
- コードブロック・図表を適宜含め、読者が手を動かせる実用的な内容にする

---

## 🔍 動作確認

`services/portal/web` で以下が正常に生成されることを確認する（`content.ts` 経由）。

- [ ] 記事一覧ページに新記事が表示される
- [ ] 記事詳細ページが表示される
- [ ] タグページ（該当タグ）に記事が表示される

---

## 🌿 ブランチ運用

**CLAUDE.md の正規フローに従うこと**（`agent-claude.yml` の簡易フローではなく）。

```
Issue → integration/{issue-number}-{slug} ブランチ（develop から分岐）
      → 作業ブランチ（claude/** 等）
      → 作業ブランチ → integration への Draft PR
```

- ブランチ名・slug は実装時に判断する
- `integration/{issue-number}-{slug}` → `develop` の PR 作成は人の確認を取ってから

---

## 📚 参考ドキュメント

- 既存記事: `services/portal/web/src/content/tech/`
- 記事読み込みロジック: `services/portal/web/src/lib/content.ts`
- frontmatter 型: `services/portal/web/src/types/content.ts`
- 開発フロー: `CLAUDE.md`, `docs/development/flow.md`

---

**自動作成**: `weekly-blog-article.yml`
