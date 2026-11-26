---
sources: []
---

# アクセシビリティ

全画面が対象。

## 要求水準

- WCAG 2.1 Level AA に適合する
- 適合は、E2E の axe による検査 (`@axe-core/playwright`、`services/tools/tests/e2e/accessibility.spec.ts`) で確かめる。検査はホーム、乗り換え変換ツール、オフライン画面、共通のヘッダーとフッターを対象にし、Level A と Level AA の両方の違反が 0 件であることを求める

## やらないこと

- **axe で検出できない項目の自動検査**: 検査の対象外の画面と、axe では判定できない項目は、自動では確かめない
