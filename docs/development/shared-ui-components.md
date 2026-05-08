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

## 設計決定の経緯（ADR）

本セクションは、本仕様を策定する過程で行った主要な意思決定とそのトレードオフを記録する。決定の中身は本ドキュメントの各セクションに反映済み。ここでは「なぜそう決めたか」「何を犠牲にしたか」「却下案は何か」だけを残す。

### ADR-1: 共通化の対象範囲をアトミックコンポーネントに限定する

**背景**: MUI の全コンポーネントを一律にラップする案と、何もラップしない案の中間で線引きが必要だった。

**決定**: アトミックなコンポーネント（Button / TextField 等）はラップ対象とし、レイアウトプリミティブ（Box / Container / Grid / Stack / Typography）はラップしない。

**根拠**:

- レイアウトプリミティブは MUI でも他ライブラリでもほぼ同じ API になり、ラップしても薄すぎて統制価値がない。
- アトミック層は意味的なバリアント（color / variant 等）を持つため、統制によりサービス間の見た目・挙動の一貫性が確保できる。
- 「すべてラップ」は工数過多、「何もラップしない」は統制不在になる。

### ADR-2: 強制力は ESLint `no-restricted-imports` で担保する

**背景**: 共通部品への誘導をレビューだけに頼ると徹底できない。

**決定**: 標準ルールの `no-restricted-imports` で MUI の対象コンポーネント直接 import をエラーとする。

**根拠**:

- 標準ルールのみで実現でき、追加プラグインの保守コストが発生しない。
- `importNames` で個別コンポーネント単位の制限ができ、レイアウトプリミティブは制限対象から除外可能。
- `sx` prop の中身まで縛るのはコスト過大なため、内部ルール + レビューで運用する。

### ADR-3: Props は MUI 透過ではなく中立な独自定義とする

**背景**: 将来 MUI 以外のライブラリへ差し替えるとき、サービス側のコードを書き換えずに済むかが争点だった。

**決定**: 共通部品の Props は 100% 独自定義とし、MUI の `ButtonProps` 等を `extends` しない。MUI の値（`'contained'` / `'outlined'` 等）も透過しない。

**根拠**:

- Props 層から MUI 依存を完全に排除することで、ライブラリ差し替え時にサービス側を無修正で維持できる。
- 「時間をかけて堅牢に」「将来の拡張性を見据えた設計」という方針に合致する。

**却下案**:

- **MUI Props 透過**: 移行コストは下がるが、差し替え時に全サービスを書き換える必要が出る。長期的には不利。

### ADR-4: 当面は MUI を継続利用しつつ、差し替え可能性を構造的に確保する

**背景**: 2026 年時点で「ヘッドレス + Tailwind + RSC ファースト」の方向に業界が動いており、MUI チーム自身も Base UI v1.0 で脱出口を提供している。

**決定**: 当面は MUI を継続利用するが、Props・トークン・テスト・ESLint の各層で MUI 依存をコンポーネント内部に閉じ込める。

**根拠**:

- 本リポジトリは MUI X（DataGrid / DatePicker 等）に依存していないため、差し替え自由度は高い。
- shadcn/ui / Mantine / Base UI が現実的な代替候補として残る。
- 急いで差し替える理由はないが、いつでも差し替えられる構造は今のうちに作るべき。

### ADR-5: エスケープハッチは `className` のみとする

**背景**: 共通部品で表現しきれないスタイル調整をどう許容するかが問題。

**決定**: `className` Props のみ受け付け、`sx` / `style` は受け付けない。

**根拠**:

- `sx` を許容すると MUI 依存が Props 層に漏れ、ADR-3 のライブラリ非依存性が崩れる。
- `className` は将来 Tailwind に移行しても活用でき、CSS-in-JS から CSS への移行パスも保つ。

### ADR-6: API 命名は業界標準パターンに揃える

**背景**: バリアント名・サイズ・色の表現方法は MUI / shadcn / Mantine / Tailwind で揺れがある。

**決定**: `variant` / `sm` `md` `lg` / セマンティック色 / boolean は接頭辞なし / `asChild` の組み合わせを採用する。

**根拠**:

- `variant` は MUI / shadcn / Mantine 全てで採用される業界デファクト。
- `sm/md/lg` は Tailwind 系の現代標準で、簡潔・拡張容易。
- セマンティック色（`primary` / `danger` 等）は意図ベースの命名で、テーマ切替時にも壊れない。視覚的命名（`blue` / `red` 等）は禁止。
- `asChild` は型推論が単純で、Next.js の `<Link>` のような外部コンポーネント統合が容易。

### ADR-7: デザイントークンは CSS 変数で実装する

**背景**: ライブラリ非依存・動的テーマ切替の両立が必要だった。

**決定**: CSS 変数（`:root`）+ TS 型定義の組み合わせで実装する。

**根拠**:

- MUI / shadcn / Tailwind すべてで CSS 変数を消費可能。ライブラリ非依存性を構造的に担保する唯一の方法。
- 動的テーマ切替（ライト・ダーク・サービス別）が CSS のみで完結する。
- 将来どのライブラリに移っても、トークン定義は無変更で持ち越せる。

**却下案**:

- **純粋な TS オブジェクト**: JS 経由でしか使えず、CSS から参照できない。
- **Tailwind config 直書き**: Tailwind ロックインが発生し、差し替え自由度が落ちる。

**実装上の制約**: MUI の `palette` には CSS 変数を渡せない（MUI 内部の `alpha()` / `decomposeColor()` が色値の文字列パースを行うため、リテラルが要求される）。このため `theme.ts` の `palette` は具体値を保持し、`tokens.css` の Primitive と一致させる運用とする。

### ADR-8: Storybook を採用し、dev 環境の `storybook.nagiyu.com` で配信する

**背景**: 共通 UI ライブラリには視覚プレビュー手段が事実上必須で、AI（Claude）と人がレビューを分担する運用に組み込みやすい媒体が必要だった。

**決定**: Storybook v8（Vite ビルダー）を `libs/ui/` に導入し、CDK で dev 環境に専用スタックを配置する。prod 環境への配信はしない。

**根拠**:

- ライト・ダーク・サービス別アクセントの動作確認が一画面で完結する。
- Claude が PR を出した後、人が dev 環境の Storybook で視覚レビューする運用が、既存の対応フロー（Issue → integration → claude/\* → Draft PR → 人レビュー）と整合する。
- 社内開発確認用途のため prod 不要。

### ADR-9: テスト戦略は既存 Playwright を活用しつつ a11y を必須化する

**背景**: 共通 UI の品質要求は通常のサービスより高く、a11y を継続的に担保する仕組みが必要だった。

**決定**:

- ユニットテスト: Jest + Testing Library を `tests/` 配下に分離配置。
- a11y: `jest-axe` を新規導入し、ユニットテスト内に同居。
- ビジュアルリグレッション: 既存の Playwright で Storybook の各 Story をスクリーンショット差分検証。
- カバレッジ閾値は既定（80%）より厳しめの 90% を目標とする（段階的引き上げ中）。
- Stories は `src/` 配下にコンポーネント隣接配置（テストではなくカタログ用途のため、テスト分離方針の対象外）。

**根拠**:

- `jest-axe` で a11y を継続的に担保できる（ADR-1 の「アクセシビリティは努力義務」の実装手段）。
- Playwright が既に導入済みのため、Chromatic 等の有料 SaaS を導入せずビジュアルリグレッションを賄える。
- 共通 UI は性質上カバレッジを上げやすく、品質要求も高いため閾値を引き上げる価値がある。

### ADR-10: 段階的にコンポーネント単位（縦切り）で Phase を進める

**背景**: 13 ラッパー × 9 サービスの全置換を一度に行うと PR が巨大化しレビュー不能になる。

**決定**: Phase 1〜4 の各コンポーネントごとに「実装 / 全サービス置換 / ESLint 強制」の 3 PR 構造で進める。

**根拠**:

- 各 PR のレビュー観点が明確になり、問題発生時の切り戻しが容易。
- ビッグバン（一括置換）は PR が巨大になりレビュー不能。
- サービス単位（横切り）は複数コンポーネントを同時対応する必要があり負担が重い。

### ADR-11: 改修フローは「サービス側で止めず、後追い拡張」とする

**背景**: 共通部品が Props 不足で要件を満たせない場合、サービス側の実装が止まると本末転倒。

**決定**:

1. サービス側で一時的に ESLint disable + 理由コメントを付与し、MUI を直接利用して実装を進める。
2. 並行して `libs/ui` 改修 Issue を起票する。
3. 共通部品が拡張されたら、サービス側を切り替えて ESLint disable を削除する。

**根拠**:

- 個人開発の小規模性を考慮し、過剰なプロセスは避ける。
- ESLint disable に理由を必須化することで、grep で例外箇所を後追いできる状態を維持できる。
- モノレポ前提のため、破壊的変更は同 PR で全更新するのが最も簡素。

---

## 関連ドキュメント

- [ブランチ戦略](../branching.md)
- [共通ライブラリ設計](shared-libraries.md)
- [コーディング規約](rules.md)
- [テスト戦略](testing.md)
- [開発フロー](flow.md)
- [アーキテクチャ](architecture.md)
