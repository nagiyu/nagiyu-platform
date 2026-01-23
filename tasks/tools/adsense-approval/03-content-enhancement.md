# タスク: コンテンツの拡充

## 概要

「有用性の低いコンテンツ」の評価を改善するため、ツールの詳細説明、使い方ガイド、FAQ を追加する。

## 関連ドキュメント

- **親タスク**: [README.md](./README.md)
- **サービスドキュメント**:
  - [docs/services/tools/README.md](../../../docs/services/tools/README.md)
  - [docs/services/tools/requirements.md](../../../docs/services/tools/requirements.md)
  - [docs/services/tools/tools-catalog.md](../../../docs/services/tools/tools-catalog.md)

## 背景

現在、Tools サービスには「乗り換え変換ツール」が1つしかなく、サイト全体のコンテンツ量が不足している。Google AdSense の審査では、コンテンツの量と質が重要。

## 実装内容

### 1. トップページの改善

**ファイルパス**: `services/tools/src/app/page.tsx`

**追加コンテンツ**:
- サイトの概要説明（2-3段落）
- 提供ツールの一覧と説明
- サイトの特徴（PWA対応、オフライン動作など）

**実装例**:
```typescript
<Container maxWidth="lg" sx={{ py: 4 }}>
  <Typography variant="h4" component="h1" gutterBottom align="center">
    Tools - 便利なツール集
  </Typography>

  <Typography variant="body1" paragraph align="center" sx={{ mb: 4 }}>
    Toolsは、日常的に便利なツール群を提供する無料のWebアプリケーションです。
    すべてのツールはブラウザ内で動作し、入力データは外部に送信されません。
  </Typography>

  <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>
    提供ツール
  </Typography>

  <Grid container spacing={3} sx={{ mt: 2 }}>
    {/* ツールカード */}
  </Grid>

  <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 6 }}>
    特徴
  </Typography>

  <Box sx={{ mt: 2 }}>
    <Typography variant="body1" paragraph>
      ✓ オフライン対応: PWAとしてインストール可能
    </Typography>
    <Typography variant="body1" paragraph>
      ✓ プライバシー保護: データはブラウザ内でのみ処理
    </Typography>
    <Typography variant="body1" paragraph>
      ✓ 完全無料: すべての機能を無料で利用可能
    </Typography>
  </Box>
</Container>
```

### 2. 使い方ガイドセクション

**ファイルパス**: `services/tools/src/app/transit-converter/page.tsx`

**追加コンテンツ**:
- ツールの使い方の詳細説明
- ステップバイステップガイド
- 入力例と出力例

**実装方法**:
- ツールページ内に「使い方」セクションを追加
- Accordion コンポーネントで折りたたみ可能にする

**実装例**:
```typescript
<Accordion>
  <AccordionSummary>
    <Typography>使い方ガイド</Typography>
  </AccordionSummary>
  <AccordionDetails>
    <Typography variant="h6">ステップ1: テキストの入力</Typography>
    <Typography paragraph>
      乗り換え案内のテキストを入力欄に貼り付けます...
    </Typography>
    {/* 以下、各ステップ */}
  </AccordionDetails>
</Accordion>
```

### 3. FAQページ

**ファイルパス**: `services/tools/src/app/faq/page.tsx`

**コンテンツ要件**:
- よくある質問と回答
- 最低10個のQ&A

**質問例**:
1. このサイトは無料ですか？
2. データはどこに保存されますか？
3. オフラインで使えますか？
4. どのブラウザに対応していますか？
5. スマートフォンで使えますか？
6. 個人情報は収集されますか？
7. 広告が表示されるのはなぜですか？
8. 新しいツールのリクエストはできますか？
9. バグを見つけた場合はどうすればいいですか？
10. ソースコードは公開されていますか？

**実装方法**:
- Material-UI の `Accordion` コンポーネントを使用
- 各Q&Aを展開可能に

### 4. About ページの拡充

**ファイルパス**: `services/tools/src/app/about/page.tsx`

**追加コンテンツ**:
- サイトの詳細な目的
- 開発の経緯
- 技術スタックの詳細説明
- 今後の展望

## ファイル構成

```
services/tools/src/app/
├── page.tsx (改善)
├── transit-converter/
│   └── page.tsx (使い方ガイド追加)
├── faq/
│   └── page.tsx (新規)
└── about/
    └── page.tsx (拡充)
```

## 実装方針

### コンテンツの質

- 具体的で詳細な説明
- ユーザーにとって有用な情報
- SEOを意識したキーワードの使用

### UI/UX

- 読みやすいタイポグラフィ
- 適切な見出し構造（h1, h2, h3）
- 視覚的な階層構造

### アクセシビリティ

- 適切な見出しレベル
- スクリーンリーダー対応
- キーボードナビゲーション対応

## 受入基準

- [ ] トップページに概要説明が追加されている
- [ ] トップページにサイトの特徴が記載されている
- [ ] 乗り換え変換ツールに使い方ガイドが追加されている
- [ ] FAQ ページが作成され、最低10個のQ&Aがある
- [ ] About ページが拡充されている
- [ ] すべての追加コンテンツがレスポンシブ対応している
- [ ] コンテンツの量が十分にある（各ページ300文字以上）

## テスト要件

### E2E テスト

**ファイルパス**: `services/tools/e2e/content.spec.ts`

- トップページのコンテンツ表示確認
- FAQ ページの表示確認
- Accordion の展開/折りたたみ動作確認

## 注意事項

- コンテンツは日本語で記載
- SEOを意識したキーワードの使用
- ユーザーにとって有用な情報を提供

## 完了後のアクション

- FAQ ページへのリンクをフッターに追加（タスク: 02-site-structure.md で実施済みの場合は更新）
- サイトマップに FAQ ページを追加（タスク: 04-seo-optimization.md）
