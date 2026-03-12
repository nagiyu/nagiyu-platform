# タスクドキュメントの整備

## 概要

本タスクは、nagiyu-platform リポジトリにおいて `tasks/` ディレクトリの仕組みを確立し、
ドキュメント不足・整備が必要な箇所を洗い出して対応方針を定めることを目的とする。

リポジトリは**ドキュメント駆動開発**を採用しているにもかかわらず、
一部のサービス・ライブラリでドキュメントの欠損や `tasks/` ディレクトリ自体が存在しない状態であった。
本ドキュメントはその現状調査と今後の整備計画をまとめたものである。

## 関連情報

- Issue: #1999
- タスクタイプ: プラットフォームタスク（ドキュメント整備）
- ブランチ: `copilot/create-task-documentation`

---

## 現状調査

### tasks/ ディレクトリ

- **状態**: 本タスク実施前は存在しなかった
- **対応**: ブランチ `copilot/create-task-documentation` において `tasks/` ディレクトリを新設し、本ドキュメントを配置した

### docs/ 全体構造

```
docs/
├── README.md                  # プロジェクト全般方針
├── branching.md               # ブランチ戦略
├── development/               # 開発ガイドライン（12ファイル）
├── templates/                 # ドキュメントテンプレート
├── agents/                    # AIエージェント説明
├── services/                  # サービス別ドキュメント
│   ├── admin/
│   ├── auth/
│   ├── codec-converter/
│   ├── niconico-mylist-assistant/
│   ├── share-together/        ← ドキュメント不足
│   ├── stock-tracker/
│   └── tools/
├── libs/                      # ライブラリドキュメント
│   ├── aws/                   ← README のみ
│   ├── browser/               ← README のみ
│   ├── common/                ← README + logging.md のみ
│   └── ui/                    ← README のみ
└── infra/                     # インフラドキュメント
```

### サービス別ドキュメント現状

| サービス | README | requirements | architecture | deployment | testing | api-spec | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | api-spec 未作成 |
| auth | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | roles-and-permissions.md あり、充実 |
| codec-converter | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ui-design.md あり、充実 |
| niconico-mylist-assistant | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | api-spec 未作成 |
| share-together | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ドキュメントが大幅不足 |
| stock-tracker | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 充実 |
| tools | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | tools-catalog.md あり |

### ライブラリ別ドキュメント現状

| ライブラリ | README | architecture | api-spec | その他 | 備考 |
| --- | --- | --- | --- | --- | --- |
| @nagiyu/aws | ✅ | ❌ | ❌ | — | README のみ |
| @nagiyu/browser | ✅ | ❌ | ❌ | — | README のみ |
| @nagiyu/common | ✅ | ❌ | ❌ | logging.md | 最低限あり |
| @nagiyu/ui | ✅ | ❌ | ❌ | — | README のみ |
| @nagiyu/react | ❌ | ❌ | ❌ | — | docs/libs 配下にフォルダなし |
| @nagiyu/nextjs | ❌ | ❌ | ❌ | — | docs/libs 配下にフォルダなし |

---

## 対応方針

ドキュメント駆動開発の基盤を強化するため、**優先度に基づいて段階的にドキュメントを整備する**。

優先度の判断基準:

- **高**: 実装が完了・稼働中にもかかわらず設計ドキュメントが欠如している箇所
- **中**: ドキュメントはあるが API 仕様など重要な情報が欠落している箇所
- **低**: ライブラリなど内部向けで、README だけでも当面は運用可能な箇所

---

## 要件

### 機能要件

- FR1: `tasks/` ディレクトリを新設し、今後のタスクドキュメントの起点とする
- FR2: share-together サービスの不足ドキュメント（requirements, deployment, testing, api-spec）を作成する
- FR3: admin, niconico-mylist-assistant, tools の api-spec.md を作成する
- FR4: @nagiyu/react, @nagiyu/nextjs の docs/libs 配下ディレクトリおよび README を作成する
- FR5: @nagiyu/aws, @nagiyu/browser, @nagiyu/ui に architecture.md を追加する

### 非機能要件

- NFR1: 全ドキュメントは `docs/templates/` のテンプレートに準拠した構成とする
- NFR2: ドキュメントは Markdown 4 スペースインデントを遵守する
- NFR3: 各ドキュメントは単体で読んで理解できる自己完結した内容とする
- NFR4: 実コードは記述せず、概念・設計パターンレベルで表現する

---

## タスク

### Phase 1: tasks/ ディレクトリの確立（本タスク）

- [x] T001: `tasks/` ディレクトリを新設する
- [x] T002: Issue #1999 のタスクドキュメント（本ファイル）を作成する

### Phase 2: share-together ドキュメントの整備（優先度: 高）

- [ ] T003: `docs/services/share-together/requirements.md` を作成する
- [ ] T004: `docs/services/share-together/deployment.md` を作成する
- [ ] T005: `docs/services/share-together/testing.md` を作成する
- [ ] T006: `docs/services/share-together/api-spec.md` を作成する
- [ ] T007: `docs/services/share-together/README.md` にドキュメント一覧を追記する

### Phase 3: 他サービスの api-spec 整備（優先度: 中）

- [ ] T008: `docs/services/admin/api-spec.md` を作成する
- [ ] T009: `docs/services/niconico-mylist-assistant/api-spec.md` を作成する
- [ ] T010: `docs/services/tools/api-spec.md` を作成する

### Phase 4: ライブラリドキュメントの整備（優先度: 低）

- [ ] T011: `docs/libs/react/README.md` を作成する（@nagiyu/react）
- [ ] T012: `docs/libs/nextjs/README.md` を作成する（@nagiyu/nextjs）
- [ ] T013: `docs/libs/aws/architecture.md` を作成する
- [ ] T014: `docs/libs/browser/architecture.md` を作成する
- [ ] T015: `docs/libs/ui/architecture.md` を作成する

---

## 参考ドキュメント

- [プロジェクト全般方針](../docs/README.md)
- [コーディング規約・べからず集](../docs/development/rules.md)
- [アーキテクチャ方針](../docs/development/architecture.md)
- [共通ライブラリ設計](../docs/development/shared-libraries.md)
- [サービステンプレート](../docs/development/service-template.md)
- [ドキュメントテンプレート一覧](../docs/templates/)

---

## 備考・未決定事項

- `tasks/` ディレクトリの命名規則は `issue-{番号}-{概要}.md` 形式を標準とする（本ドキュメント以降この形式に統一）
- Phase 3, 4 の各サービス・ライブラリのドキュメント作成は、それぞれ個別 Issue を立てて管理することを推奨する
- share-together の api-spec は architecture.md 記載の Auth Consumer パターン・DynamoDB 設計を踏まえて作成すること
