---
sources:
  - libs/ui/src/components/layout/Header.tsx
  - libs/ui/src/utils/navigation.ts
sources_hash: 0f2f1526f2d9691102577e153be1652b839f0201154639b851f8ae657438d55c
---

# Header

ページ上部のヘッダー。タイトル、ナビゲーション、アカウントメニューを持つ。MUI の `AppBar` で描く。`@nagiyu/ui` から `Header` を import する。ログインの状態からヘッダーを組み立てるときは [SessionHeader](./session-header.md) を使う。

## 使い方

```tsx
<Header
    title="Admin"
    navigationItems={[{ label: 'ユーザー', href: '/users', requiredPermission: 'users:read' }]}
    roles={roles}
    user={{ name: '太郎', email: 'taro@example.com' }}
    onLogout={handleLogout}
/>
```

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `title` | string | `Nagiyu Platform` | ロゴの位置に出すタイトル |
| `href` | string | `/` | タイトルのリンク先 |
| `ariaLabel` | string | `{title} - Navigate to homepage` | タイトルのリンクの `aria-label` |
| `navigationItems` | `NavigationItem[]` | なし | ナビゲーションの項目 |
| `roles` | string[] | なし (権限なし) | 利用者のロール ID。`requiredPermission` の判定に使う |
| `actions` | ReactNode | なし | アカウントメニューの手前に置く要素 (バッジなど) |
| `user` | `{ name, email?, avatar? }` | なし | 指定するとアバターがアカウントメニューを開く |
| `onLogout` | `() => void` | なし | ログアウトの処理 |
| `logoutLabel` | string | `ログアウト` | ログアウトの表示名 |
| `onDeleteAccount` | `() => void` | なし | 退会・データ削除の処理 |
| `deleteAccountLabel` | string | `退会・データ削除` | 退会の表示名 |

`NavigationItem`:

| 項目 | 内容 |
|---|---|
| `label` | 表示名 (兄弟の中で一意にする。React の key に使う) |
| `href` | リンク先 |
| `icon` | アイコン (任意) |
| `children` | 子の項目。あればドロップダウン (任意)。描くのは 1 段目の子だけで、孫は描かない |
| `requiredPermission` | 必要な権限 (任意)。`roles` が満たすときだけ表示する |

## 振る舞い

### ナビゲーション

- `md` (900 px) 以上は横並びのメニュー。それ未満はハンバーガーボタンで左からのドロワー (幅 250 px) を開く。表示する項目が 1 つもなければ、どちらも出さない
- `children` を持つ項目 (空配列を含む) は、横並びではドロップダウン、ドロワーでは開閉する入れ子になる。`children` が未指定なら単純なリンク
- ドロワーの中のリンクを押すと、ドロワーが閉じる

#### 権限による絞り込み

絞り込みは孫以降も同じ規則でたどる。

| 条件 | 扱い |
|---|---|
| `requiredPermission` があり、`roles` が満たさない | その項目を子ごと除く |
| 子がすべて除かれた親 | 親も除く (開いても空のメニューになるため) |
| 元から `children: []` の項目 | 残す。利用側の意図を尊重する |
| `requiredPermission` がない | 常に表示する |

権限の判定は [`hasPermission`](../common/roles-and-permissions.md) による。`roles` を渡さないと権限なしとして扱うので、`requiredPermission` を持つ項目は出ない。

#### 現在地

現在のパス (`usePathname`) に一致する項目を 1 つだけ選ぶ。

- 項目の `href` とパスは、クエリとハッシュを除き、末尾のスラッシュを落として比べる。`/` で始まらない `href` (`#` など) は対象外
- 一致は、パスが `href` と等しいか、`href` に `/` を挟んで続く場合 (`/tools` に対する `/tools/json`)。文字列の前方一致ではないので、`/tools` に `/tools-x` は一致しない。`/` は完全に等しいときだけ一致する (全ページに一致するのを避けるため)
- 一致が複数あれば、`href` のパスが最も長いものを選ぶ。子の項目も、描かれない孫以降も対象に含める
- 選んだ項目は `href` ではなく項目そのもので持つ。同じ `href` の別の項目が一緒に選ばれないようにするため

現在地の項目には `aria-current="page"` を付ける。見た目の示し方は場所で異なる。

| 場所 | 示し方 |
|---|---|
| 横並びのトップ項目 | 太字と下線 |
| ドロップダウンの親ボタン (直接の子が現在地のとき) | 太字と下線 (`aria-current` は付かない) |
| ドロップダウンの子 | MUI の `selected` による背景色の変化だけ |
| ドロワーの項目・子 | MUI の `selected` による背景色の変化だけ。ドロワーの親は、子が現在地でも太字にならない |

太字と下線は、色だけに頼らずに現在地を示すためのもので、横並びのトップ項目とドロップダウンの親ボタンにだけ付く。ドロワーでは、子が現在地のとき親を開いた状態から始める。

### actions

アカウントメニューの手前に常に置く。モバイルでも表示する。ナビゲーションとの間は伸縮する余白で、`actions` とアカウントメニューを右端に寄せる。

### アカウントメニュー

| `user` | `onLogout` | 描くもの |
|---|---|---|
| あり | あり / なし | アバターのボタン。押すと、名前とメールアドレス、区切り線、メニュー項目を出す |
| なし | あり | ログアウトの単独のボタン |
| なし | なし | 何も出さない |

- アバターは `user.avatar` の画像。なければ名前の 1 文字目 (名前が空なら `?`)
- メニュー項目は `onLogout` があるときログアウト、`onDeleteAccount` があるとき退会・データ削除。どちらも押すとメニューを閉じてからハンドラを呼ぶ
- `onDeleteAccount` は `user` があるときだけ使われる
- サインアウト先の URL を作る処理は [auth サービスへの URL](./auth-urls.md) にある
