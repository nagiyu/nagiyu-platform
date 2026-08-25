# 週次npm管理レポート

- 検出日時: {{CREATE_TIME}}
- 次回チェック: {{NEXT_DATE}}

## 検出サマリー

| 項目 | 件数 |
|---|---:|
| 脆弱性 Critical | {{CRITICAL}} |
| 脆弱性 High | {{HIGH}} |
| 脆弱性 Moderate | {{MODERATE}} |
| 脆弱性 Low | {{LOW}} |
| 更新可能パッケージ | {{OUTDATED_SUMMARY}} |
| バージョン不整合 | {{INCONSISTENCY_COUNT}} |
| 重複 devDependencies | {{DUPLICATES_COUNT}} |
{{DETECTION_TARGETS_SECTION}}
## 対応方針

{{POLICY_LINE}}

上記は検出日時点のスナップショットです。**作業時は以下を実行し、その時点の最新情報に基づいて進めてください。**

```bash
npm audit
npm outdated
```
