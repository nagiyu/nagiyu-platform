---
id: livetalk/api/lifecycle
title: 生活サイクル API
kind: api
service: livetalk
sources:
  - services/livetalk/web/src/app/api/lifecycle/route.ts
  - services/livetalk/core/src/lifecycle/state-resolver.ts
  - services/livetalk/core/src/constants.ts
sources_hash: b13c33fc973d30173a5d759657d45cc36bcef256ffa9488099a5d139917f644f
terms: [livetalk/term/permission, livetalk/term/api-error, livetalk/term/lifecycle, livetalk/term/character]
related_cards: [livetalk/screen/home, livetalk/api/chat]
related_adr:
  - services/livetalk/architecture.md#2.6
---

# 生活サイクル API

キャラクターが今、起きているか寝ているかを返す。ホーム画面が、最初の発話を待たずにキャラクターの表示へ反映するために読む。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| GET | `/api/lifecycle` | ログインしていること |

## 入力と出力

- 問い合わせ `characterId` は任意。省略または登録外のときは `hiyori`
- 出力は `{ state: 'awake' | 'sleeping' }`。[生活サイクル](../term/lifecycle.md)の就寝・起床の時刻と、今の日本時間から決める。記録がなければ既定の 01:30 から 09:30 が就寝中

## エラー

- 読み取りに失敗しても 500 にせず、`awake` を返す。失敗は Admin へ報告する ([API のエラー応答](../term/api-error.md))
- 未ログインは 401

## つながり

```mermaid
flowchart TD
    S[ホーム画面] --> A[生活サイクル API]
    A --> L[(生活サイクル)]
    C[チャット API] -.同じ判定.-> L
```
