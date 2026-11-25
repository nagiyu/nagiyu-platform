---
sources:
  - configs/eslint.config.no-restricted-mui.mjs
  - configs/eslint.config.web.mjs
sources_hash: 8a9a480804407c75b0339cee637a447bd7050d7bf42d05862e228662a6f1a298
---

# 共通 UI コンポーネントの規約

`libs/ui` (`@nagiyu/ui`) の共通コンポーネントを、サービスがどう使い、`libs/ui` がどう作るかの規則と、その理由。各部品の使い方と振る舞いは UI の仕様 (`docs/platform/specs/lib/ui/` 配下) にある。サービスからの MUI の直接 import の制限だけ ESLint が強制し、ほかは強制している設定がなく、レビューで守らせる。

## サービスでの使い方

### ラップ済みの MUI コンポーネントは、サービスから直接 import せず `@nagiyu/ui` から import する

対象は `Button`、`TextField`、`Checkbox`、`Chip`、`Link`、`Select`、`MenuItem`、`FormControl`、`InputLabel` である。`@mui/material` からの import と、`@mui/material/Button` のような個別パスからの import のどちらも `no-restricted-imports` がエラーにする。設定は `configs/eslint.config.no-restricted-mui.mjs` にあり、`configs/eslint.config.web.mjs` が取り込む。サービスの `eslint.config.mjs` は `eslint.config.web.mjs` を spread して使う。

共通化をレビューだけに頼ると、サービスごとに同じ部品の見た目と挙動がずれていく。機械的に止めれば、ずれの入り口が無くなる。プラグインを足さず標準ルールで済むため、保守するものも増えない。`sx` の中身までは縛らない。縛るコストに見合わないため、レビューで見る。

`libs/ui` の中にはこの制限を適用しない。部品の実装で MUI を直接使う必要があるためである。サービスの `eslint.config.mjs` から取り込む形にして、`libs/ui` へ効かない構成にしている。

### レイアウトの部品、テーマの基盤、MUI の型は、MUI を直接使ってよい

`Box`、`Container`、`Grid`、`Stack`、`Typography` と、`CssBaseline`、`ThemeProvider`、`AppRouterCacheProvider`、`SxProps`、`Theme` などは制限の対象に入れていない。レイアウトの部品は、MUI でも他のライブラリでもほぼ同じ API になり、ラップしても薄すぎて統制の価値がない。基盤の部品は、フレームワークに依存して当然の領域である。

### `ServiceLayout` か `AppThemeProvider` を使い、`AppRouterCacheProvider` と `ThemeProvider` と `CssBaseline` の定型を自前で書かない

`ServiceLayout` を採用するサービスは、ルートレイアウトで `ServiceLayout` をそのまま使う。採用しないサービスは `AppThemeProvider` を使う。定型を各サービスが持つと、テーマの当て方が食い違う。

### ナビゲーション、アカウント周り、利用規約は共通の部品に任せる

- サービスは独自の `Navigation` を作らず、項目を `Header` に渡す。権限による出し分けも `Header` の `requiredPermission` に任せ、判定を自前で書かない。バッジなどは `Header` を作り直さず `actions` に渡す。
- ログアウトと退会の導線は、本体の画面に自前で並べず、`Header` のアカウントメニューに寄せる。退会フローの実体はサービスが持ち、コールバックで渡す。
- ログインのあるサービスは、セッションからヘッダーを組み立てる処理を自前で書かず、`SessionHeader` を使う。
- 利用規約とプライバシーポリシーは、ダイアログでもページでも `LegalSections` で描画する。サービス独自の文面も `@nagiyu/ui` のデータ形式で渡す。見た目をサービス間で揃えるため、描画部品にはオプションを持たせない。オプションを足すと、同じ描画がまた分かれていく。
- 課金を受けるサービスは、特定商取引法に基づく表記を、`@nagiyu/ui` の共通のデータと表示部品で描画する。ページは各サービスが自分のサービスに置き、文面を自前で持たない。文面が食い違うのを防ぐためである。

### 重い依存や ESM のみの依存を持つ部品は、barrel に混ぜず subpath export で提供する

例は `next-auth` に依存する `SessionHeader` で、`@nagiyu/ui/session-provider` から import する。barrel から re-export すると、無関係な部品を import しただけで、`@nagiyu/ui` を使う全サービスがその依存を読み込む。サービスの Jest が ESM を変換する設定を持たないと、それだけで落ちる。依存は `@nagiyu/ui` の `peerDependencies` に置き、実際に使うサービスが用意する。

### MUI を直接使うときは、理由を書いた `eslint-disable-next-line` を付ける

```tsx
// eslint-disable-next-line no-restricted-imports -- 数値入力の step/min/max (slotProps.htmlInput) が共通の TextField にない
import { TextField } from '@mui/material';
```

理由のない disable は書かない。理由を必須にすると、grep で例外の箇所を洗い出し、共通の部品が育ったときに置き換えられる。

Radio グループの `FormControl` (fieldset と legend の意味づけに使う) と、MUI の `Menu` の子の `MenuItem` は、共通の部品で置き換えられないため、この方法で例外にする。

### 共通の部品が足りないときは、理由付きの disable で MUI を使って進め、`libs/ui` の改修を別に起こす

サービスの実装を共通部品の改修待ちで止めない。共通の部品が育ったら、サービスの側を切り替えて disable を外す。共通部品を足す条件は、2 つ以上のサービスで使う見込みがあることで、見込みは Issue か PR のコメントに根拠 (実例か計画) を書いて示す。

## `libs/ui` の作り方

### Props の型は独自に定義し、MUI の型を継承しない

MUI の `ButtonProps` などを `extends` せず、`variant: 'contained'` のような MUI の値もそのまま透過しない。Props から MUI の依存を無くしておけば、MUI から別のライブラリへ差し替えるときに、サービスを書き換えなくて済む。MUI の Props を透過する案は、今の移行コストは下がるが、差し替えのときに全サービスを書き換えることになるため採らない。

### `variant`、`color`、`size` などは、厳密な Union 型にする

`string` で緩く受けると、存在しない値を渡してもコンパイルが通り、部品の側で見た目が崩れる。

```ts
// OK
type Props = { variant: 'solid' | 'outline' | 'ghost'; size: 'sm' | 'md' | 'lg' };

// NG
type Props = { variant: string; size: string };
```

### API の名前は、業界標準のパターンに揃える

| 種別 | 規則 | 例 |
|---|---|---|
| バリアント | `variant` | `solid` / `outline` / `ghost` |
| サイズ | `size` | `sm` / `md` / `lg` |
| 色 | `color` | `primary` / `secondary` / `danger` / `success` / `warning` / `neutral` |
| boolean | 接頭辞を付けない | `disabled`、`loading`、`open` |
| イベント | React 標準の名前 | `onClick`、`onChange` |
| 別の要素へ見た目を渡す | `asChild` | `<Button asChild><a href="/">...</a></Button>` |

- 色は意味で名付ける。`blue` や `red` のような見た目の名前は使わない。テーマを切り替えたときに、名前と見た目が食い違う。
- MUI の `contained` / `outlined` / `text` は、意味の名前 (`solid` / `outline` / `ghost`) に付け替える。
- `asChild` を使うのは、`<Link>` のような別のコンポーネントをそのまま見た目つきで出せ、型の推論も単純だからである。

名前を MUI、shadcn、Mantine など主要なライブラリに揃えておくと、将来ライブラリを差し替えるときの摩擦が小さい。

### スタイルの口は `className` だけにし、`sx` と `style` は受け付けない

`sx` を許すと MUI への依存が Props に漏れる。`className` なら、将来 CSS-in-JS から CSS へ移しても、そのまま使える。

### 単純な部品は Props で設定し、複合部品はコンポジションで作る

`Button`、`TextField` などは Props だけで完結させる。`Card` や `Tabs` のように子の構成を呼び出し側が決める部品を足すときは、`<Card.Header>` のような Compound Components で作る。今の `libs/ui` に、この形の部品はまだない。

### 重要な部品は、アクセシビリティを `jest-axe` で検査する

重要な部品 (`Button`、`TextField`、`Checkbox`、`Select` など) は、WCAG AA 相当を目標にする。`libs/ui/tests/setup.ts` が `jest-axe` の `toHaveNoViolations` を全テストで使えるようにしており、ユニットテストの中で `axe(container)` を呼ぶ。キーボード操作と ARIA 属性は、MUI の既定に任せず、テストで明示的に確かめる。

## CSS

### 色、余白、文字などの値は、デザイントークンから取る

トークンの構造と読み込み方は [デザイントークン](../specs/lib/ui/design-tokens.md) にある。サービスのルートレイアウトでは、`@nagiyu/ui/tokens.css` と `@nagiyu/ui/base.css` をこの順に import する。

### 全サービスに当てるグローバル CSS は `libs/ui` の base に置き、サービスでリセットを書き直さない

サービスごとにリセットが違うと、同じ部品でも余白やリンクの見た目がサービスによって変わる。サービス側のグローバル CSS には、そのサービス固有の指定だけを置き、base の後に import する。

### フォント、背景色、文字色、ダークモードは、グローバル CSS では扱わない

MUI のテーマと `CssBaseline` に任せる。body への指定は、後から当たる `CssBaseline` に上書きされるため、グローバル CSS に書いても効かない。

### Tailwind などの CSS フレームワークのグローバルなリセットを持ち込まない

base のリセットと二重に当たり、フォーム部品の見た目などがサービスごとに食い違う。

### `html` と `body` に `overflow-x: hidden` を置かない

はみ出した部分が横スクロールできずに切り落とされ、読めなくなる。ページの `scrollWidth` を見る E2E でもはみ出しを検知できなくなる。はみ出しは、はみ出す要素の側で直す。

### 空白のない長い文字列には `overflow-wrap: anywhere` を付ける

対象は URL、ファイル名、メールアドレス、ID などである。`break-word` は表示上の折り返しだけを変え、要素の最小幅は長い 1 語の幅のまま残る。flex の子や表のセルは、既定ではこの最小幅より縮まないので、`break-word` では隣のボタンが押し出されたままになる。`anywhere` は最小幅の計算にも効くため、親に `min-width: 0` を足さなくても縮む。

- `html` や `body` など全体にかける共通の指定にはしない。表の列の幅の配り方まで変わり、意図しない列が潰れる。
- 表のセルに付けるときは、最小幅も一緒に付ける。表は空いた幅を列に配るとき、最小幅の小さい列から削る。`anywhere` で最小幅がほぼ 0 になった列は細く潰され、短い値まで途中で割れる。

### 列の多い表は、表の中で横スクロールさせ、ページ全体は広げない

見出しと操作ボタンの列は、折り返さない指定にする。日本語の見出しはどこでも折り返せるため、指定がないと 1 文字ずつ縦に並ぶまで潰れる。空状態の文言は表の外に置く。表の行に置くと、横スクロールする表の幅の中央に置かれ、狭い画面では見えない位置に出る。

### 和文のラベルと値を 1 行に並べるときは、ラベルを折り返さない

値に `anywhere` を付けても、ブラウザは先にラベルの途中 (和文の文字間) で改行する。

## Stories とテスト

### Stories は `src/` の部品の隣に置き、テストは `tests/` に置く

Stories (`*.stories.tsx`) はテストではなくカタログと目視のための資材なので、`src/` の部品の隣に置く。テストは `libs/ui/tests/unit/components/<部品>/` に置く。`src/` からテストを分離する規則は、[テストの規約](./testing.md) にある。

### カバレッジの閾値は、既定より厳しく置く

共通の部品は性質上カバレッジを上げやすく、品質の要求も高いため、`libs/ui/jest.config.ts` で既定の 80 % より厳しい値を置く。今の値はそのファイルにある。

## 改修の流れ

### 変更は `libs/ui` と使うサービスを同じ PR で更新する

Props の削除、必須化、型の変更のような破壊的な変更は、使っている全サービスを同じ PR で直す。モノレポなので、使う側を同じ PR で直せる。直せない移行が要るときだけ、非推奨の期間を 1 リリース挟む。
