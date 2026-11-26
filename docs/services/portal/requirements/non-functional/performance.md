---
sources: []
---

# 性能

読者が記事を快適に読め、AdSense の審査と検索の評価で不利にならないための、ページの表示性能の水準。対象は Portal の全ページ。

## 要求水準

| 項目 | 水準 |
|---|---|
| Lighthouse の Performance | 90 以上 |
| LCP (Largest Contentful Paint) | 2.5 秒以下 |
| INP (Interaction to Next Paint) | 200 ミリ秒以下 |
| CLS (Cumulative Layout Shift) | 0.1 以下 |

- LCP・INP・CLS の値は、Google が Core Web Vitals で Good とする基準である
- 測り方は[リソース](../../specs/resource/web-runtime.md)の「手順」を参照

## やらないこと

なし
