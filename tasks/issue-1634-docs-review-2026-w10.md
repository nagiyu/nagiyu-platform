# 2026年第10週 週次ドキュメントレビュー

## 概要

週次ドキュメントレビューを実施し、ドキュメント間の実際の齟齬を調査した。
以下の2件の不整合が確認されており、修正が必要。

## 関連情報

- Issue: #1634
- 前回レビュー Issue: #1633
- タスクタイプ: プラットフォームタスク
- 対象期間: 2026-03-02 〜 2026-03-09

---

## 発見した齟齬と修正案

### 齟齬1: 共通ライブラリのカバレッジ要件が実態と不一致

#### 問題の概要

`docs/development/rules.md` に「共通ライブラリ（`libs/*`）は 80% 以上を**推奨（必須ではない）**」と記述されているが、
実際には全 `libs/` パッケージの `jest.config.ts` に `coverageThreshold: { global: { branches: 80, ... } }` が設定されており、
80% 未満ではCIが自動失敗する（必須扱い）になっている。

さらに `docs/development/rules.md` 内にも「MUST: common は高いテストカバレッジを維持」という記述があり、
同ファイル内で矛盾している。

#### 影響ファイル

- **齟齬元**: `docs/development/rules.md`
    - 「共通ライブラリ（`libs/*`）は 80% 以上を推奨（必須ではない）」という記述
- **実態（jest.config.ts）**: 全6ライブラリすべてで80%必須
    - `libs/common/jest.config.ts`
    - `libs/browser/jest.config.ts`
    - `libs/ui/jest.config.ts`
    - `libs/react/jest.config.ts`
    - `libs/aws/jest.config.ts`
    - `libs/nextjs/jest.config.ts`

#### 修正案

`docs/development/rules.md` の以下の行を変更する。

変更前:
```
- 共通ライブラリ（`libs/*`）は 80% 以上を推奨（必須ではない）
```

変更後:
```
- 共通ライブラリ（`libs/*`）も 80% 以上必須（`coverageThreshold` 設定により自動チェック）
```

---

### 齟齬2: `@nagiyu/nextjs` ライブラリが複数ドキュメントから欠落

#### 問題の概要

`libs/nextjs/` は実際に存在するパッケージ（Next.js API Route ヘルパー、`@nagiyu/common` に依存）だが、
以下のドキュメントに記載がなく、存在するライブラリとして扱われていない。

`.github/copilot-instructions.md` には `libs/nextjs/` の記載があるが、それ以外のドキュメントに漏れがある。

#### 影響ファイル

| ファイル | 状況 |
| --- | --- |
| `.github/copilot-instructions.md` | ✅ 記載あり |
| `docs/development/shared-libraries.md` | ❌ 記載なし |
| `docs/README.md` | ❌ 共通ライブラリ一覧に記載なし |

#### 修正案

##### `docs/development/shared-libraries.md`

「共通パッケージ (libs/\*)」の説明に `@nagiyu/nextjs` を追加する。

「ライブラリ構成」セクションの `libs/` ディレクトリ一覧に `nextjs/` を追加する:

```
libs/
├── ui/           # Next.js + Material-UI 依存
├── browser/      # ブラウザAPI依存
├── react/        # React依存
├── nextjs/       # Next.js依存（APIルートヘルパー等）
├── aws/          # AWS SDK 依存
└── common/       # 完全フレームワーク非依存
```

「依存関係ルール」セクションに以下を追記する:

```
nextjs → common
```

`libs/nextjs/` の責務セクションを追加する（`libs/react/` セクションの後):

- **責務**: Next.js に依存するユーティリティ
- **含まれるもの**: APIルート認証ヘルパー（`withAuth`）、リポジトリ初期化ヘルパー、ページネーション、エラーハンドリング
- **パッケージ名**: `@nagiyu/nextjs`
- **設計のポイント**: Next.js API Route 専用、`@nagiyu/common` のみに依存

##### `docs/README.md`

「共通ライブラリ」セクションの一覧に `@nagiyu/nextjs` を追加する:

```
- @nagiyu/nextjs - Next.js依存のユーティリティ（APIルートヘルパー等）
```

---

## タスク

- [x] T001: `docs/development/rules.md` の共通ライブラリカバレッジ記述を修正する（「推奨（必須ではない）」→「必須」）
- [x] T002: `docs/development/shared-libraries.md` に `@nagiyu/nextjs` の記述を追加する
- [x] T003: `docs/README.md` の共通ライブラリ一覧に `@nagiyu/nextjs` を追加する

## 参考ドキュメント

- [コーディング規約](../docs/development/rules.md)
- [共通ライブラリ設計](../docs/development/shared-libraries.md)
- [ドキュメント全般](../docs/README.md)
