---
sources: []
---

# 対応端末

利用者が使う端末と、画面の幅への対応。全画面が対象。

## 要求水準

- スマートフォン、タブレット、PC の画面幅で使える。ツール一覧は、画面の幅に応じて列数を変える ([ツール一覧](../functional/tool-list.md))
- ブラウザは、Chrome、Firefox、Safari、Edge の最新版
- スマートフォンでは、ホーム画面に追加して、アプリのように開ける。他のアプリの共有シートから、乗り換え変換ツールへ内容を渡せる ([乗り換え変換ツール](../functional/transit-converter.md))
- E2E では、次の端末で確かめる。Fast CI は `chromium-mobile` だけ、Full CI は全端末で回す

| 端末 | 画面幅 |
|---|---|
| `chromium-desktop` | 1920 x 1080 |
| `chromium-mobile` (Pixel 5) | 393 x 851 |
| `webkit-mobile` (iPhone 12) | 390 x 844 |

## やらないこと

- **E2E でのタブレットと Firefox、Edge の検査**: E2E の端末は上の 3 つだけで、タブレットの幅と、Chromium と WebKit 以外のブラウザは検査しない
