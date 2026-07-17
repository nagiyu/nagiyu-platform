## 📝 週次ブログ記事（インタビュー方式）

このIssueは自動作成されました。Portal 技術ブログの記事を、**書き手の一次体験を素材に 1 本**書いてください（書けるネタがある場合）。

**トピックを新規に捻り出して埋める書き方はしません。** 素材が無ければ、無理に書かず破棄してこの Issue をクローズしてかまいません（それが正常な運用です）。

## 📋 実行情報

- 作成日時: {{CREATE_TIME}}
- 次回作成予定: {{NEXT_DATE}}

---

## 🎯 進め方

**[`portal-article`](../../.claude/skills/portal-article/SKILL.md) スキルに従うこと。** 要点:

1. **素材の起点を決める**（トピックを製造しない）
    - 書き手が実際に stake を持つ題材だけを扱う。候補は「未消化のネタ」か「直近で実際にハマった／判断した経験」。
    - 良い起点が無ければ ④ の破棄へ直行してよい。
2. **インタビューする（1 巡で終わらせない）**
    - 記憶にしかない部分（最初の遭遇状況・つまづき・疑って外した仮説・分かった瞬間の感情）を質問で掘る。
    - **ループ**: まとめを見せ、薄いところを角度を変えて掘り直す。浅い 1 巡で切り上げない。
3. **下書きする**（AI は生成器ではなく編集者）
    - 技術的な正確さを保ちつつ、一次体験を前面に出す。使っていない機能の網羅的「完全ガイド」化はしない。
4. **キルスイッチ（最重要）— ただし掘り切ってから**
    - 判定は**文量ではなく一次体験の濃度**。以下が 1 つも入らないかを見る。
        - 時系列 / 感情 / 寄り道（外した仮説・回り道）/ その人固有の決定
    - **浅い 1 巡での薄さでは破棄しない**。角度を変えて複数回（目安 2〜3 巡）掘っても 1 つも埋まらないときにのみ**破棄**（別題材 or この Issue をクローズ）。「まだ掘っていないから薄い」（→ ループへ）と「掘っても素材が無い」（→ 破棄）を区別する。
5. **抽象度を上げる**
    - 一般に効く教訓は内部固有名詞（`develop` / `integration` 等）を避け、汎用表現で書く。

---

## 📄 記事仕様

**1 Issue につき記事 1 本**（複数本まとめ作成は不可）。

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
    categories:
      - dev-stack
    ---
    ```

- **タグ**: 既存タグと整合させ、`isLinkableTag` 対象の ASCII slug タグを最低 1 つ含める
- **言語**: 日本語で執筆

---

## ✅ 品質基準

- **一次体験の濃度**を最優先する（分量は目安であって基準ではない）。上のキルスイッチのチェックリストを満たすこと。
- 構成は型に縛られない。教科書的な `はじめに → 本文 → まとめ` の水増しはしない。
- コードブロック・図表は、実体験の説明に必要な範囲で用いる。

---

## 🔍 動作確認（原稿でなく描画を見る）

記事は integration へ反映し、**dev 環境の描画で**確認する（`content.ts` 経由）。

- [ ] `https://dev.nagiyu.com/tech/{slug}` でレンダリング結果を確認した（薄ければインタビューに戻るか破棄）
- [ ] 記事一覧ページに新記事が表示される
- [ ] 記事詳細ページが表示される
- [ ] タグページ（該当タグ）に記事が表示される

---

## 🌿 ブランチ運用

**CLAUDE.md の正規フローに従うこと**（`agent-claude.yml` の簡易フローではなく）。Portal 記事は「デプロイして描画を見ないと検証できない」ため、軽量変更に見えても **integration 経由**にする。

```
Issue → integration/{issue-number}-{slug} ブランチ（develop から分岐）へ直接コミット
      → dev 自動デプロイ → 描画確認
      → integration → develop への Draft PR（書式 CI ＋ 人ゲート）
```

- ブランチ名・slug は実装時に判断する
- `integration/{issue-number}-{slug}` → `develop` の PR 作成は人の確認を取ってから

---

## 📚 参考

- 記事の書き方スキル: `.claude/skills/portal-article/SKILL.md`
- 既存記事: `services/portal/web/src/content/tech/`
- 記事読み込みロジック: `services/portal/web/src/lib/content.ts`
- frontmatter 型: `services/portal/web/src/types/content.ts`
- 開発フロー: `CLAUDE.md`, `docs/development/flow.md`

---

**自動作成**: `weekly-blog-article.yml`
