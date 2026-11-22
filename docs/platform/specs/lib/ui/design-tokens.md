---
sources:
  - libs/ui/src/styles/tokens.css
  - libs/ui/src/styles/tokens.ts
  - libs/ui/src/styles/theme.ts
  - libs/ui/src/styles/base.css
sources_hash: 39b95dd4688e87f9f5433685eedefe13a4632fad90f5b9360ad7bc3e372fc202
---

# デザイントークン

色・余白・文字・角丸・影などの値を CSS 変数として配る仕組み。`@nagiyu/ui/tokens.css` が変数を定義し、`@nagiyu/ui/base.css` が最小限のリセットを当てる。TypeScript からは `@nagiyu/ui/tokens` (メインの `@nagiyu/ui` からも import できる) の `tokens` で変数への参照を得る。MUI のテーマ (`theme`) も同じ値から作る。

## 使い方

| import | 内容 |
|---|---|
| `@nagiyu/ui/tokens.css` | Primitive と Semantic の CSS 変数 |
| `@nagiyu/ui/base.css` | リセット |
| `@nagiyu/ui/tokens` | `tokens` (CSS 変数への参照の文字列)、`breakpoints`、型 `ThemeMode` / `ColorRole` / `Size` |
| `@nagiyu/ui` | 上記の `tokens` / `breakpoints` と、MUI のテーマ `theme` |

```ts
import { tokens } from '@nagiyu/ui/tokens';

const style = { color: tokens.color.action.primary.default };
// { color: 'var(--color-action-primary)' }
```

## 振る舞い

### 構造

値は 2 層に分ける。

| 層 | 名前の形 | 役割 |
|---|---|---|
| Primitive | `--primitive-{カテゴリ}-{段階}` (例: `--primitive-blue-600`) | 生の値。テーマで変わらない |
| Semantic | `--{カテゴリ}-{役割}` (例: `--color-action-primary`) | 意味。Primitive を参照し、ダークテーマで上書きされる |

### カテゴリ

| カテゴリ | Semantic の名前 | 値 |
|---|---|---|
| 背景 | `--color-bg-canvas` / `-surface` / `-subtle` | ライトは gray-50 / white / gray-100 |
| 文字 | `--color-fg-default` / `-muted` / `-disabled` / `-on-accent` | 黒の 87% / 60% / 38% の不透明度。`on-accent` は white |
| 枠線 | `--color-border-default` / `-subtle` / `-strong` | ライトは gray-300 / 200 / 400 |
| アクション | `--color-action-{role}` と `-hover` / `-active` / `-subtle` / `-fg` | role は primary / secondary / danger / warning / success / info / neutral |
| 余白 | `--spacing-xs` / `sm` / `md` / `lg` / `xl` / `2xl` | 4 / 8 / 16 / 24 / 32 / 48 px |
| フォント | `--font-family-sans` / `-mono` | システムフォント |
| 文字サイズ | `--font-size-xs` / `sm` / `md` / `lg` / `xl` | 0.75 / 0.875 / 1 / 1.25 / 1.5 rem |
| 文字の太さ | `--font-weight-regular` / `-medium` / `-bold` | 400 / 500 / 700 |
| 行の高さ | `--line-height-tight` / `-normal` / `-loose` | 1.2 / 1.5 / 1.66 |
| 角丸 | `--radius-none` / `sm` / `md` / `lg` / `full` | 0 / 4 / 8 / 12 / 9999 px |
| 影 | `--shadow-sm` / `md` / `lg` / `xl` | |
| 重なり | `--z-dropdown` / `sticky` / `modal` / `toast` / `tooltip` | 1000 / 1100 / 1300 / 1400 / 1500 |
| 遷移の時間 | `--duration-fast` / `normal` / `slow` | 150 / 250 / 400 ms |
| 遷移の曲線 | `--easing-linear` / `in` / `out` / `in-out` | |

- Primitive の余白は 0 から 64 px まで (`--primitive-space-0` 〜 `--primitive-space-16`)。Semantic の余白はその一部を名前に割り当てる
- Primitive の文字サイズは `3xl` (2rem) と `4xl` (2.5rem) まであり、Semantic には `xl` までしかない
- ブレークポイントは Primitive の CSS 変数 `--primitive-breakpoint-sm` / `md` / `lg` / `xl` (600 / 900 / 1200 / 1536 px) だけで、Semantic はない。TypeScript の `breakpoints` は `xs: 0` を加えた数値 (0 / 600 / 900 / 1200 / 1536) で、MUI のテーマに渡す
- `tokens.color.action` は neutral を持たない (primary / secondary / danger / warning / success / info の 6 色)。neutral の変数 (`--color-action-neutral-*`) は CSS から参照する

### テーマの切り替え

- ライトが既定で、`:root` と `[data-theme='light']` に Semantic を定義する
- ダークは `[data-theme='dark']` で、色に関わる Semantic (背景・文字・枠線・アクション) だけを上書きする。余白・文字・角丸・影・重なり・遷移はモードに依存せず、上書きしない
- ダークのアクションは暗い背景で見えるよう、ライトより明るい Primitive に割り当てる。アクション色の上に載せる文字色 (`-fg`) は gray-900 になる (neutral を除く)
- `<html data-theme="dark">` を付ける処理はこのライブラリにはない

### MUI のテーマ

`theme` は MUI の `createTheme` で作る。

| 項目 | 内容 |
|---|---|
| palette | primary / secondary / error / warning / info / success の main・light・dark・contrastText、背景、文字、区切り線。値はライトテーマの Primitive の具体値 |
| typography | `fontFamily` は `var(--font-family-sans)`。見出し h1〜h6、body1 / body2、button、caption のサイズ・太さ・行の高さ。ボタンの文字は大文字にしない |
| breakpoints | `breakpoints` の値 |
| components | `MuiButton` (角丸 `--radius-md`、余白 8px 16px、contained は影なしでホバーに `--shadow-sm`)、`MuiCard` (角丸 `--radius-lg`、影 `--shadow-md`、ホバーで `--shadow-lg`)、`MuiTextField` (outlined、角丸 `--radius-md`) |

palette は常にライトの値で、ダークテーマでは切り替わらない。CSS 変数を直接参照している部分だけがダークに追従する。

### base.css の中身

| 規則 | 内容 |
|---|---|
| `*` | `box-sizing: border-box`、padding と margin を 0 |
| `a` | 色は親から継承、下線なし |

フォント・背景色・ダークモードは MUI の `CssBaseline` とテーマが持つため、ここでは扱わない。

## 理由

- palette が CSS 変数ではなく具体値を持つ。MUI の内部の `alpha()` と `decomposeColor()` は `var(--...)` を色として解釈できないため、色には具体値が要る。サイズ・余白・角丸・影・遷移のような色以外の値は色の解析が走らないので、変数を直接参照できる
- 部品が Semantic だけを参照する。テーマの切り替えを Primitive の割り当ての上書きだけで済ませ、部品の側を変えずに済ませるため

## 手順

サービスは、ルートレイアウト (`layout.tsx`) と `global-error.tsx` の両方で `@nagiyu/ui/tokens.css` と `@nagiyu/ui/base.css` を import する。`global-error.tsx` はルートレイアウトを置き換えるため、ルートレイアウトの import が引き継がれない。片方だけだと、エラー画面だけ変数が未定義になる。
