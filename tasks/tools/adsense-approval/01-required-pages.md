# タスク: 必須ページの追加

## 概要

Google AdSense 審査に必要な必須ページを追加する。

## 関連ドキュメント

- **親タスク**: [README.md](./README.md)
- **サービスドキュメント**:
  - [docs/services/tools/README.md](../../../docs/services/tools/README.md)
  - [docs/services/tools/requirements.md](../../../docs/services/tools/requirements.md)
  - [docs/services/tools/architecture.md](../../../docs/services/tools/architecture.md)

## 背景

Google AdSense の審査要件として、以下のページが必須：
- プライバシーポリシー
- 利用規約
- サイトについて（About）
- お問い合わせ

現在、これらのページが存在しないため、審査に落ちている。

## 実装内容

### 1. プライバシーポリシーページ (`/privacy`)

**ファイルパス**: `services/tools/src/app/privacy/page.tsx`

**コンテンツ要件**:
- Google AdSense の使用について明記
- Cookie の使用について
- アクセス解析ツールの使用（将来的に）
- データの取り扱い（クライアント側のみで処理、サーバーに送信しない）
- 第三者配信の広告サービス（Google AdSense）について

**参考テンプレート**:
```markdown
# プライバシーポリシー

## 広告の配信について
当サイトは Google AdSense を使用しており、第三者配信による広告を掲載しています。

## Cookie の使用について
広告配信のために Cookie を使用することがあります。

## データの取り扱い
当サイトで入力されたデータは、お使いのブラウザ内でのみ処理され、サーバーに送信されることはありません。
```

### 2. 利用規約ページ (`/terms`)

**ファイルパス**: `services/tools/src/app/terms/page.tsx`

**コンテンツ要件**:
- サービスの利用条件
- 免責事項
- 禁止事項
- 著作権について

**参考テンプレート**:
```markdown
# 利用規約

## サービスの利用について
本サービスは無料で提供され、誰でも自由に利用できます。

## 免責事項
本サービスの利用により生じたいかなる損害についても、当方は責任を負いません。

## データの取り扱い
入力されたデータはブラウザ内でのみ処理され、外部に送信されません。
```

### 3. サイトについてページ (`/about`)

**ファイルパス**: `services/tools/src/app/about/page.tsx`

**コンテンツ要件**:
- サイトの目的
- 提供しているツールの説明
- 開発者情報（簡易的でよい）
- サイトの技術スタック（任意）

**参考テンプレート**:
```markdown
# Tools について

## サイトの目的
Tools は、日常的に便利なツール群を提供する無料のWebアプリケーションです。

## 提供ツール
- 乗り換え変換ツール: 乗り換え案内のテキストを整形してコピー

## 技術スタック
- Next.js
- Material-UI
- PWA 対応
```

### 4. お問い合わせページ (`/contact`)

**ファイルパス**: `services/tools/src/app/contact/page.tsx`

**コンテンツ要件**:
- 問い合わせ方法の案内
- メールアドレスまたは GitHub Issues へのリンク
- 対応時間・対応方針の明記

**参考テンプレート**:
```markdown
# お問い合わせ

## お問い合わせ方法
バグ報告や機能要望は、GitHub Issues でお願いします。

GitHub リポジトリ: [nagiyu-platform](https://github.com/nagiyu/nagiyu-platform-3/issues)

## 注意事項
個人プロジェクトのため、すべての要望に対応できるわけではありません。
```

## ファイル構成

```
services/tools/src/app/
├── privacy/
│   └── page.tsx
├── terms/
│   └── page.tsx
├── about/
│   └── page.tsx
└── contact/
    └── page.tsx
```

## 実装方針

### UI コンポーネント

すべてのページで共通の UI 構成を使用：
- Material-UI の `Container`, `Typography` を使用
- レスポンシブ対応
- シンプルで読みやすいレイアウト

### メタデータ

各ページに適切なメタデータを設定：
```typescript
export const metadata: Metadata = {
  title: 'プライバシーポリシー - Tools',
  description: 'Tools のプライバシーポリシー',
};
```

### コンテンツの配置

- 長文のコンテンツは読みやすいように段落分け
- 見出しを適切に使用（h1, h2, h3）
- リスト形式で箇条書き

## 受入基準

- [ ] `/privacy` ページが表示される
- [ ] `/terms` ページが表示される
- [ ] `/about` ページが表示される
- [ ] `/contact` ページが表示される
- [ ] すべてのページがレスポンシブ対応している
- [ ] すべてのページに適切なメタデータが設定されている
- [ ] Google AdSense の要件を満たすコンテンツが含まれている
- [ ] プライバシーポリシーに Google AdSense の使用が明記されている

## 注意事項

- コンテンツは日本語のみ
- 法律的に正確な表現を使用（必要に応じて専門家に相談）
- Google AdSense のポリシーに準拠した内容

## 完了後のアクション

- フッターにこれらのページへのリンクを追加（次のタスク: 02-site-structure.md）
- メタデータの改善（タスク: 05-metadata-improvement.md）
