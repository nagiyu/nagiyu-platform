# 共通 UI コンポーネント設計

## 目的

本ドキュメントは、`@nagiyu/ui`（`libs/ui/`）における共通 UI コンポーネントの設計方針・API 規約・開発フローを定義する。

各サービス（`services/*/web`）は、原則として共通 UI コンポーネントのみを利用する。MUI（`@mui/material`）の直接利用は ESLint で制限し、共通化を機械的に強制する。

技術的な背景・選定経緯は Issue #2900 を参照。

---

## 基本方針

- **ライブラリ非依存**: コンポーネントの Props には MUI 固有の型を一切露出させない。将来 MUI 以外（Base UI / shadcn/ui 等）への差し替えが可能な構造を維持する。
- **トークン駆動**: 色・余白・タイポグラフィ等は CSS 変数として定義したデザイントークンを参照する。コンポーネントは MUI Theme ではなくトークンに依存する。
- **薄いコア + 段階拡張**: Phase 1〜4 で段階的にコンポーネントを追加し、各 Phase で API 設計・移行・ESLint 強制を 1 セットとする。
- **業界標準パターンの採用**: API 命名・コンポジション構造は Radix / shadcn / Mantine 等の業界標準と整合させ、将来の差し替え時の摩擦を最小化する。

---

## 適用範囲

### 対象（ラップして共通化する）

`libs/ui/` 配下に共通コンポーネントとして実装する対象。

| Phase | コンポーネント                                        | 統合する MUI                                                                                     |
| ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1     | `Button` / `TextField` / `Checkbox` / `Chip` / `Link` | 同名の MUI コンポーネント                                                                        |
| 2     | `Select`                                              | `Select` + `MenuItem` + `FormControl` + `InputLabel`                                             |
| 3     | `Card` / `Tabs` / `List`                              | `Card` + `CardContent` + `CardActions` + `CardActionArea` / `Tabs` + `Tab` / `List` + `ListItem` |
| 4     | `Snackbar` / `Pagination` / `Badge` / `Paper`         | 同名の MUI コンポーネント                                                                        |

### 対象外（MUI 直接利用 OK）

ラップせず、サービスから MUI を直接利用してよいもの。

- **レイアウトプリミティブ**: `Box` / `Container` / `Grid` / `Stack` / `Typography`
- **インフラ系**: `CssBaseline` / `ThemeProvider` / `AppRouterCacheProvider`
- **MUI の型定義**: `SxProps` / `Theme` 等

これらはラップしても薄すぎて意味がないか、フレームワーク基盤として MUI 直接依存が許容される領域。

### 既存ラッパー（個別仕様）

以下は本方針より前に存在する個別仕様の共通コンポーネント。引き続き利用するが、汎用的な再設計はスコープ外。

- `Header` / `Footer` / `AppLayout` / `ServiceLayout`
- `ErrorBoundary` / `ErrorAlert`
- `LoadingState`
- `PrivacyPolicyDialog` / `TermsOfServiceDialog`
- `ServiceWorkerRegistration`

---

## 設計原則

### アクセシビリティ

- **努力義務**として、重要部品（`Button` / `TextField` / `Checkbox` / `Select` / `Tabs` / `Snackbar` 等）は WCAG AA 相当を保証する。
- ユニットテスト内で `jest-axe` による自動チェックを必須とする。
- キーボード操作・ARIA 属性は MUI のデフォルトに任せず、テストで明示的に検証する。

### 型安全性

- `variant` / `color` / `size` 等の Props は **厳密な Union 型**で表現する。
- `string` 型での緩い受け入れは禁止。

```typescript
// OK
type Props = {
  variant: 'solid' | 'outline' | 'ghost';
  color: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'neutral';
  size: 'sm' | 'md' | 'lg';
};

// NG
type Props = {
  variant: string;
  color: string;
};
```

### コンポジション戦略（ハイブリッド）

- **単純部品**（`Button` / `TextField` / `Checkbox` / `Chip` 等）は **設定駆動**（Props で完結）
- **複合部品**（`Card` / `Tabs` / `List` 等）は **コンポジション API**（Compound Components パターン）

```tsx
// 設定駆動の例
<Button variant="solid" color="primary" size="md">保存</Button>

// コンポジションの例
<Card>
    <Card.Header>タイトル</Card.Header>
    <Card.Body>本文</Card.Body>
    <Card.Actions>
        <Button>OK</Button>
    </Card.Actions>
</Card>
```

### エスケープハッチ

- **`className` のみ許容**。`sx` / `style` の Props は受け付けない。
- 理由: `sx` を許容すると MUI 依存が Props 層に漏れ、ライブラリ非依存性が崩れる。`className` は将来 Tailwind に移行しても活用可能で、CSS-in-JS から CSS への移行パスも保つ。

### ライブラリ非依存度

- 共通コンポーネントの **Props 型は 100% 独自定義**とする。
- MUI の `ButtonProps` 等を `extends` してはならない。
- MUI の `color` / `variant` の値（`'inherit'` / `'contained'` 等）をそのまま透過してはならない。

---

## API 命名規約

### 基本ルール

| 種別        | 規約       | 例                                                                                   |
| ----------- | ---------- | ------------------------------------------------------------------------------------ |
| バリアント  | `variant`  | `variant: 'solid' \| 'outline' \| 'ghost'`                                           |
| サイズ      | `size`     | `size: 'sm' \| 'md' \| 'lg'`                                                         |
| 色・意図    | `color`    | `color: 'primary' \| 'secondary' \| 'danger' \| 'success' \| 'warning' \| 'neutral'` |
| boolean     | 接頭辞なし | `disabled` / `loading` / `open`                                                      |
| イベント    | React 標準 | `onClick` / `onChange` / `onOpenChange`                                              |
| Polymorphic | `asChild`  | Radix の Slot パターンを採用                                                         |

### `asChild` の使い方

子要素のタグをそのまま使い、親（Button 等）のスタイル・属性をマージする。

```tsx
// 通常のボタン
<Button onClick={handleSave}>保存</Button>

// 見た目はボタン、実体は Next.js の Link（遷移目的）
<Button asChild variant="solid" color="primary">
    <Link href="/dashboard">ダッシュボードへ</Link>
</Button>
```

### 値の禁止事項

- **視覚的命名は禁止**: `color="blue"` / `color="red"` は不可。常に意味で命名する（`primary` / `danger` 等）。
- **MUI の値をそのまま使わない**: MUI の `variant: 'contained' | 'outlined' | 'text'` は意味的に `solid` / `outline` / `ghost` に再定義する。

---

## デザイントークン仕様

### 構造

トークンは **2 層構造** で定義する。

| 層            | 役割                         | 例                                                   |
| ------------- | ---------------------------- | ---------------------------------------------------- |
| **Primitive** | 生の値（色、px、フォント等） | `--primitive-blue-500: #3B82F6;`                     |
| **Semantic**  | 意味（文脈・用途）           | `--color-action-primary: var(--primitive-blue-500);` |

**コンポーネントは Semantic トークンのみ参照**する。テーマ切替（ライト・ダーク・サービス別アクセント）は Primitive の割り当てを変えることで実現する。

### カテゴリ

| カテゴリ   | 例                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| color      | `bg.surface` / `bg.subtle` / `fg.default` / `fg.muted` / `border.default` / `action.primary` / `action.danger` 等 |
| spacing    | `xs` / `sm` / `md` / `lg` / `xl` / `2xl`                                                                          |
| typography | `fontSize.{xs..xl}` / `fontWeight.{regular,medium,bold}` / `lineHeight.{tight,normal,loose}` / `fontFamily`       |
| radius     | `none` / `sm` / `md` / `lg` / `full`                                                                              |
| shadow     | `sm` / `md` / `lg` / `xl`                                                                                         |
| breakpoint | `sm` / `md` / `lg` / `xl`                                                                                         |
| zIndex     | `dropdown` / `sticky` / `modal` / `toast` / `tooltip`                                                             |
| transition | `duration.{fast,normal,slow}` / `easing.{linear,in,out,inOut}`                                                    |

### 実装方式

- **CSS 変数**を `libs/ui/src/styles/tokens.css` に定義する。
- TS 側からは `libs/ui/src/styles/tokens.ts` で参照ヘルパーと型を提供する。
- 共通ラッパーコンポーネントは `tokens.css` の CSS 変数を直接参照する（MUI Theme を経由しない）。
- MUI Theme（`libs/ui/src/styles/theme.ts`）は移行期の互換性のために維持するが、`palette` は MUI 内部の色解析（`alpha()` / `decomposeColor()`）の制約により具体的な色値を保持する。`tokens.css` の Primitive 値と一致させること。`borderRadius` / `boxShadow` / `transition` 等の非カラー値は CSS 変数をそのまま参照できる。

### サービス側での読み込み

サービスのルートレイアウト（`app/layout.tsx`）で `@nagiyu/ui/tokens.css` を import すること。これによりトークンが `:root` レベルで利用可能になる。

```tsx
import '@nagiyu/ui/tokens.css';
```

### テーマ切替

- **ライト・ダーク**: `[data-theme='dark']` で Primitive を上書きする。
- **サービス別アクセント**: 必要に応じて `[data-service='{service-name}']` で `--color-action-primary` 等を上書きする。デフォルトは単一値で運用し、各サービスでの上書きは必要が生じた段階で追加する。
- **マルチブランド**: 現状未対応。将来必要になれば `[data-brand='...']` で同様に拡張する。

---

## ファイル構成

```
libs/ui/
├── src/
│   ├── components/
│   │   └── {Component}/
│   │       ├── {Component}.tsx           # 実装
│   │       ├── {Component}.stories.tsx   # Storybook（隣接配置）
│   │       └── index.ts                  # 再エクスポート
│   ├── styles/
│   │   ├── tokens.css                    # CSS 変数定義
│   │   ├── tokens.ts                     # TS 参照ヘルパー・型
│   │   └── theme.ts                      # MUI Theme（CSS 変数参照）
│   └── index.ts
└── tests/
    └── components/
        └── {Component}/
            └── {Component}.test.tsx      # ユニット + a11y テスト（分離配置）
```

### Stories とテストの配置方針

- **Stories**（`*.stories.tsx`）は **`src/` 配下にコンポーネント隣接**で配置する。Storybook はテストではなくカタログ・プレビュー用途のため、CLAUDE.md の「テスト分離方針」の対象外として扱う。
- **テスト**（`*.test.tsx`）は CLAUDE.md の規約通り、**`tests/` 配下に分離**して配置する。

---

## 開発・確認環境

### Storybook

- `libs/ui/` に Storybook v8（Vite ビルダー）を導入する。
- 各コンポーネントの Stories で全 variant / color / size を網羅する。
- ライト・ダーク切替アドオンを有効化する。

### dev 環境デプロイ

- CDK で `infra/ui-storybook/` 配下に専用スタックを作成する。
- ビルドした Storybook 静的サイトを S3 + CloudFront 経由で配信する。
- ドメイン: `storybook.nagiyu.com`
- prod 環境へのデプロイは行わない。

---

## テスト要件

### 必須テスト

| 種別                   | ツール                 | 配置                            |
| ---------------------- | ---------------------- | ------------------------------- |
| ユニットテスト         | Jest + Testing Library | `tests/components/{Component}/` |
| アクセシビリティテスト | `jest-axe`             | ユニットテスト内に同居          |

### 推奨テスト

| 種別                     | ツール                 | 配置                       |
| ------------------------ | ---------------------- | -------------------------- |
| ビジュアルリグレッション | Playwright + Storybook | `tests/visual/`            |
| インタラクションテスト   | Storybook Play 関数    | Stories 内（Phase 3 以降） |

#### ビジュアルリグレッションテスト（Phase 1 以降で本格運用）

`libs/ui/tests/visual/` 配下に Playwright のテストを配置し、Storybook の各 Story（`iframe.html?id=...`）をスクリーンショット差分で検証する。Phase 0-4 時点ではディレクトリ・設定とも未作成。Phase 1 以降の Button 実装と並行して以下の構成で導入する。

```
libs/ui/tests/visual/
├── playwright.config.ts       # Storybook URL を baseURL に設定
└── components/
    └── Button.spec.ts         # 各 Story のスクリーンショット
```

運用は既存 Playwright（Fast CI: chromium-mobile のみ / Full CI: 全デバイス）の方針に揃える。差分があればテスト失敗 → 視覚レビューでベースライン更新を承認。

### カバレッジ閾値

`libs/ui/` は既定（80%）より厳しめのカバレッジを要求する。最終目標は spec 値、現時点は段階的引き上げ中。

**最終目標（spec）**:

```typescript
coverageThreshold: {
    global: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
    },
}
```

**現状値（PR 0-4 時点）**:

```typescript
coverageThreshold: {
    global: {
        branches: 80,
        functions: 80,
        lines: 90,
        statements: 90,
    },
}
```

`branches` / `functions` は既存ラッパーの一部（`Header.tsx` 等）の網羅率不足により最終目標に届いていない。Phase 1 以降のテスト整備と並行して順次引き上げる。

---

## ESLint による強制

### `no-restricted-imports` の設定

ラップ対象の MUI コンポーネントは、サービス側から直接 import できないように制限する。

```javascript
// configs/eslint.config.base.mjs（または services 用 override）
{
    rules: {
        'no-restricted-imports': ['error', {
            paths: [{
                name: '@mui/material',
                importNames: ['Button', 'TextField', 'Checkbox', 'Chip', /* ... */],
                message: '共通コンポーネントは @nagiyu/ui から import してください',
            }],
            patterns: [{
                group: ['@mui/material/Button', '@mui/material/TextField', /* ... */],
                message: '共通コンポーネントは @nagiyu/ui から import してください',
            }],
        }],
    },
}
```

### スコープ

- **適用対象**: `services/*/web/` 配下
- **適用対象外**: `libs/ui/` 内（MUI 直接利用が必要）、レイアウトプリミティブ（`Box` / `Container` / `Grid` / `Stack` / `Typography`）

### 例外運用

どうしても MUI を直接利用する必要がある場合は、`eslint-disable-next-line` コメントに **理由を必須**で記述する。

```tsx
// eslint-disable-next-line no-restricted-imports -- 共通部品に未対応の機能。Issue #XXXX で共通化検討中
import { CustomComponent } from '@mui/material';
```

理由なしの `eslint-disable` は禁止。grep で例外箇所を後追いできる状態を維持する。

---

## ガバナンス

### 共通部品追加の基準

- **2 サービス以上で利用される見込みがあること**を追加の最低条件とする。
- 利用見込みは Issue / PR コメントで根拠を示す（実例 or 計画）。

### 改修フロー

サービス開発中に共通部品の不足が判明した場合の流れ。

1. サービス側で **一時的に ESLint disable + 理由コメント**を付与し、MUI を直接利用して実装を進める
2. 並行して **`libs/ui` 改修 Issue** を起票
3. 共通部品が拡張されたら、サービス側を切り替えて ESLint disable を削除

実装を止めずに改善を後追いする運用とする。

### バージョニング

`@nagiyu/ui` のバージョン管理ルール。

| 変更種別                   | バージョン     | 対応                            |
| -------------------------- | -------------- | ------------------------------- |
| 新規コンポーネント追加     | minor          | そのまま追加                    |
| Props 追加（オプショナル） | minor          | そのまま追加                    |
| Props 削除・必須化・型変更 | **major**      | 全サービス側を **同 PR で更新** |
| デフォルト値の変更         | minor or major | 影響範囲次第                    |

モノレポ前提のため、破壊的変更は同 PR で全サービス更新を行う。段階的廃止が必要な場合のみ deprecation を 1 リリース挟む。

### レビュープロセス

CLAUDE.md の対応フロー（[`docs/development/flow.md`](flow.md)）に準拠する。

```
Issue 起票
    ↓
integration/{issue-number}-{slug} 作成
    ↓
claude/* で実装
    ↓
Draft PR (claude/* → integration/*)
    ↓
人がレビュー（dev 環境の Storybook で視覚確認）
    ↓
Ready 化・マージ（人力）
```

dev 環境の Storybook で視覚レビューが完結する点が、本ガバナンスの肝。

---

## 関連ドキュメント

- [ブランチ戦略](../branching.md)
- [共通ライブラリ設計](shared-libraries.md)
- [コーディング規約](rules.md)
- [テスト戦略](testing.md)
- [開発フロー](flow.md)
- [アーキテクチャ](architecture.md)
