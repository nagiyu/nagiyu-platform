---
sources: []
---

# 共通ライブラリの公開と版の規約

`libs/` の共通ライブラリを版付きのパッケージとして npmjs.com に公開し、サービスが版を選んで依存するための規則。何を libs へ切り出すか、libs の中の書き方は [共通ライブラリの規約](./shared-libraries.md)、publish のワークフローの振る舞いと手順は [ライブラリの publish](../specs/ci/lib-publish.md) にある。強制している設定ファイルはなく、レビューで守らせるため、出典は持たない。

## 公開先

### npmjs.com に public で公開する

| 項目 | 内容 |
|---|---|
| レジストリ | `https://registry.npmjs.org` |
| スコープ | `@nagiyu` (個人アカウント `nagiyu` のスコープ) |
| 公開範囲 | public。読む側に token は要らない |
| 対象 | `@nagiyu/common`、`@nagiyu/aws`、`@nagiyu/browser`、`@nagiyu/nextjs`、`@nagiyu/react`、`@nagiyu/ui` |

読む側に token が要らないため、CI・Docker のビルド・Claude の cloud セッションのどこでも、`.npmrc` も secret も置かずに `npm ci` できる。nagiyu-platform の外のリポジトリからも同じように使える。

GitHub Packages は採らない。public のパッケージでも、読む側に `read:packages` の token が要り、使うすべての場所に token を配ることになるためである。

## libs のプロジェクト

### `libs/` を、サービスと別の npm プロジェクトにする

| 項目 | 内容 |
|---|---|
| `libs/package.json` | `private: true`、`workspaces: ["*"]`。libs のビルド・テスト・Storybook に要る devDependencies を持つ |
| lockfile | `libs/package-lock.json` |
| libs どうしの依存 | `libs/` の workspaces が、手元のソースにリンクする |
| `configs/` | 相対パス (`../../configs/...`) で読む。lint はルートの install を使う |

libs を変えても、サービスの lockfile とビルドの入力が変わらないようにするためである。同じリポジトリの中に置いたまま、install だけを分ける。リポジトリを分けないのは、`configs/` と CI の共通の部品を libs とサービスで共有したままにするためである。

## パッケージの形

### ESM と CJS の両方を同梱する

各 lib は ESM 版と CJS 版の両方をパッケージに入れ、`exports` のすべてのサブパスを `import` (ESM) と `require` (CJS) の条件に分ける。CSS だけのエントリ (`@nagiyu/ui/tokens.css` など) と型定義だけのエントリ (`@nagiyu/nextjs/types/next-auth`) は分けない。

使う側が CJS で動く場合 (サービスの jest など) にも、設定を足さずに読めるようにするためである。nagiyu-platform の外のリポジトリで作るサービスも lib を使うので、直す場所を lib の 1 か所に閉じる。

| 採らない案 | 採らない理由 |
|---|---|
| ESM 版だけを出し、使う側の jest の resolver と変換で読む | 使う側ごとに同じ jest の設定が要る。外のリポジトリにも配ることになる |
| `exports` に `require` や `default` の条件を足すだけにする | 指す先の中身が ESM のままなので、CJS からは読めない |

## 版

### 版は lib ごとに独立して付ける

6 つの lib をそろえて上げない。変えた lib だけ版を上げる。そろえると、変えていない lib まで版が上がり、サービスが版を上げるときに中身の変わらない更新を確かめることになるためである。

### 0.x の間は、壊れる変更でマイナー版を、機能の追加と修正でパッチ版を上げる

| 変更 | 上げる版 | 例 |
|---|---|---|
| 使う側を壊す変更 (export の削除、引数・戻り値の型の変更、振る舞いの変更) | マイナー版 | `0.1.3` → `0.2.0` |
| 機能の追加、壊さない修正 | パッチ版 | `0.1.3` → `0.1.4` |

初版はすべて `0.1.0` にする。`1.0.0` に上げる時期は決めていない。

### libs どうしの依存は `^` の範囲で結ぶ

例: `"@nagiyu/common": "^0.1.1"`。0.x の `^` はマイナー版を固定し、パッチ版だけを受け入れる。上の版の付け方と合わせて、壊れる変更を自動で取り込まないためである。依存先の lib のマイナー版を上げたときは、依存元の範囲も上げ、依存元の版も上げる。

### 出した版の中身は変えない

一度 publish した版を、同じ番号で出し直さない (npmjs.com も同じ版の再 publish を拒む)。誤りは、次の版を出して直す。`npm unpublish` で消して出し直すと、同じ番号で中身が違う版が生まれ、どちらを使っているかを lockfile から判断できなくなるためである。

### 版はリリースのタイミングで人が決める

版の番号を上げる PR は、lib の変更と同じ PR か、その後の PR で出す。どの番号にするかは、上の版の付け方に沿って人が決める。変更の中身が使う側を壊すかどうかは、機械では判断しきれないためである。

## publish

### publish は、lib の変更を integration で確かめ終えたら人が起動する

[ライブラリの publish](../specs/ci/lib-publish.md) のワークフローを、`workflow_dispatch` で人が起動する。版を上げた lib だけが出る。

- サービスがその版に依存を上げる前に、registry にその版がある状態にする。版が無いと、サービスの `npm ci` が失敗する。
- `master` へのマージでは出さない。リリースの単位と lib の版の単位を切り離し、lib だけを先に出せるようにするためである。

### publish は trusted publishing (OIDC) で行い、token を常設しない

GitHub Actions の OIDC で npmjs.com に認証し、provenance を付けて出す。publish 用の token を secret に置き続けない。token が漏れたときに、だれでも任意の版を出せるようになるためである。まだ npmjs.com に存在しない lib を初めて出すときだけ、一時的な token を使う ([ライブラリの publish](../specs/ci/lib-publish.md) の「手順」)。

## publish 前の試し方

| 試す場所 | 方法 |
|---|---|
| libs の中 | libs のテストと Storybook で確かめる |
| 手元のサービス | lib の `npm pack` で作った tarball を、サービスに install して試す。tarball と、それを指す `package.json` と lockfile の変更は commit しない |
| dev 環境 | プレリリース版 (`x.y.z-next.N`) を publish し、サービスの依存をその版にして dev にデプロイする |

- プレリリース版は dist-tag `next` で出し、`latest` を動かさない。範囲 (`^0.1.0` など) はプレリリース版に当たらないため、ほかのサービスが意図せず取り込むことはない。
- dev で確かめ終えたら、プレリリースでない版を出し、サービスの依存をその版に上げてから develop へ入れる。プレリリース版に依存したまま develop へ入れない。
