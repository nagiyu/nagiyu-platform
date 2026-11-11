---
id: portal/api/robots
title: robots.txt
kind: api
service: portal
sources:
  - services/portal/web/src/app/robots.ts
sources_hash: 758d0a1c7223e8a2960afe18b5335611b17df53d52d7a2b168db2309c5081837
related_cards: [portal/api/sitemap]
related_adr:
  - services/portal/requirements.md#3.5 SEO・クローラビリティ要件
---

# robots.txt

検索エンジンのクローラーに、巡回してよい範囲とサイトマップの場所を伝えるテキスト。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| GET | `/robots.txt` | なし |

## 入力と出力

- 入力はない。出力は固定で、次の 4 行
    - `User-Agent: *`
    - `Allow: /`
    - `Host: https://nagiyu.com`
    - `Sitemap: https://nagiyu.com/sitemap.xml`
- 巡回を禁じるパスはない。すべてのクローラーに全体を許す
- 内容はビルド時に決まる

## エラー

- ここで返すエラーを決めていない

## つながり

```mermaid
flowchart TD
    C[検索エンジンのクローラー] --> R["/robots.txt"]
    R -->|場所を示す| S["/sitemap.xml"]
```
