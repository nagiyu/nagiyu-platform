# 2026年第13週 ドキュメントレビュー - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/testing.md に反映し、
    tasks/issue-2474-docs-review/ ディレクトリごと削除します。

    入力: tasks/issue-2474-docs-review/requirements.md
    次に作成するドキュメント: tasks/issue-2474-docs-review/tasks.md
-->

## 変更対象

| ファイル | 変更種別 | 概要 |
|---------|---------|------|
| `services/stock-tracker/web/jest.config.ts` | 設定修正 | coverageThreshold を 100% → 80% に変更 |

---

## 変更内容

### coverageThreshold の修正

**現状**: `services/stock-tracker/web/jest.config.ts` にて全メトリクスが 100% に設定されている。

```
coverageThreshold.global: { branches: 100, functions: 100, lines: 100, statements: 100 }
collectCoverageFrom: ['lib/repository-factory.ts', 'lib/percentage-helper.ts']
```

**問題**: `docs/development/testing.md` の標準基準は 80% 以上。100% 設定は例外として文書化されておらず、ドキュメントとコードが乖離している。

**修正方針**: coverageThreshold の各メトリクスを 80 に変更する（標準基準への統一）。

- `collectCoverageFrom` は現状のまま維持（対象は `lib/repository-factory.ts` と `lib/percentage-helper.ts` の 2 ファイル）
- テスト対象ファイルがシンプルなため、80% 基準で十分にカバレッジを担保できる

---

## 設計上の判断

### オプション比較

| オプション | 内容 | 採用可否 |
|-----------|------|---------|
| A（採用） | coverageThreshold を 80% に変更してコードを標準に合わせる | ✅ 採用 |
| B | 100% のままにして testing.md に例外として追記する | ❌ 不採用（設定を維持する明確な理由がない） |

**採用理由**: 収集対象が 2 ファイルのみであり、シンプルな構成で 80% 基準で十分。また、他サービスとの一貫性を保つことで、開発者の認知負荷を下げられる。

---

## 実装上の注意点

### 依存関係・前提条件

- 既存テストが `lib/repository-factory.ts` と `lib/percentage-helper.ts` の 80% 以上をカバーしていること（変更前に確認）

### セキュリティ考慮事項

- なし（設定値変更のみ）

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/testing.md` への統合は不要（coverageThreshold を標準に合わせることで整合性が取れるため）
- [ ] 本ディレクトリ（`tasks/issue-2474-docs-review/`）を削除する
