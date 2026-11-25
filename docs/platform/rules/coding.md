---
sources:
  - configs/tsconfig.base.json
  - configs/eslint.config.base.mjs
sources_hash: 1eaf7a783176261399c12e22e74767338e625df78c2c775635fb91217f362ac6
---

# コーディング規約

TypeScript の型・クラスの書き方と、ブラウザ API の使い方の規則と、その理由。コメントは [コメントの規約](./comments.md)、エラーは [エラー処理の規約](./error-handling.md)、入力の検証は [バリデーションの規約](./validation.md) にある。`strict` は tsconfig、クラスの 2 規則は ESLint が強制する。ほかは強制している設定がなく、レビューで守らせる。

## 型

### `strict` を有効にする

`configs/tsconfig.base.json` が `strict: true` を持ち、サービスの Web (`configs/tsconfig.web.json` 経由) とライブラリはこれを継承する。インフラ (`infra/`) は `infra/tsconfig.json` が自分で `strict` を有効にしている。型の誤りを実行前に見つけ、実行時エラーや予期しない動作を減らすためである。各パッケージの tsconfig で `strict` を外さない。

### 型とデフォルト値は、セットで定義する

```ts
type Config = { timeout: number; retries: number };

const DEFAULT_CONFIG: Config = { timeout: 3000, retries: 3 };
```

型とデフォルト値を別の場所に置くと、項目を足したときにデフォルト値の更新を忘れ、型と値がずれる。

## クラス

### コンストラクタの引数でプロパティを定義しない

`public readonly status: number` のような parameter properties は使わず、クラスのプロパティとして宣言して、コンストラクタで代入する。`@typescript-eslint/parameter-properties` が `prefer: 'class-property'` でエラーにする。プロパティの定義が 1 か所に並び、どこで定義されているかが一目でわかるためである。

```ts
class ApiError extends Error {
    public readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}
```

### アクセス修飾子を必ず明示する

メソッドとプロパティに `public` / `private` / `protected` を付ける。`@typescript-eslint/explicit-member-accessibility` がエラーにする。公開する API かどうかが読み取れ、リファクタリングで影響範囲を見極めやすい。コンストラクタだけは `public` を付けない (`overrides: { constructors: 'no-public' }`)。

## ブラウザ API

### `localStorage` は `useEffect` の中で読み書きする

SSR のときサーバーには `localStorage` がなく、レンダー中に読むと SSR のエラーやハイドレーションの不一致になる。初期値は `useState` に固定の値を置き、マウント後に `useEffect` で保存値を復元する。

```tsx
const [theme, setTheme] = useState<string | null>(null);

useEffect(() => {
    setTheme(getItem<string>('theme'));
}, []);
```

### ブラウザ API は、`@nagiyu/browser` に実装があればそれを使う

`localStorage` と Clipboard などは、`navigator.clipboard` や `window.localStorage` を直接触らず、`@nagiyu/browser` の関数を使う。SSR の対応、例外の処理、テストでのモックの差し替えが、サービスごとにばらばらにならないためである。使い方は [localStorage](../specs/lib/browser/local-storage.md)、[Clipboard](../specs/lib/browser/clipboard.md) にある。
