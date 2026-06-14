---
title: 'draw.io が「d.setId is not a function」で開けない：ID と Array.prototype の衝突'
description: 'draw.io で特定の .drawio ファイルを開いたときに「d.setId is not a function」が出る原因を解説します。mxGraph のデコーダがキャッシュに配列を使っており、セルの id 属性が Array.prototype のメンバ名（push など）と衝突すると、プロトタイプチェーンを経由して関数が返ってしまうのが真因です。再現手順・修正方法・JavaScript での汎用的な対策まで整理します。'
slug: 'drawio-setid-prototype-collision'
publishedAt: '2026-06-13'
updatedAt: '2026-06-13'
author: 'なぎゆー'
tags: ['JavaScript', 'TypeScript', 'デバッグ', 'draw.io']
categories: ['dev-stack']
featured: false
---

## はじめに

draw.io で `.drawio` ファイルを開こうとしたら `d.setId is not a function` というエラーが出て、ファイルが一切開けなくなった。同じディレクトリの他の `.drawio` は正常に開けるのに、特定のファイルだけ再現性よく失敗する。

エラーメッセージに `setId` とあるので mxGraph の何かとは分かる。しかし XML が壊れているわけではなく、id が重複しているわけでもない。ファイルを眺めても一見まったく問題なさそうに見える。

本記事では、この問題が起きた原因の切り分け経緯・真因・修正方法・そして「JavaScript で連想配列代わりにオブジェクトを使うリスク」という汎用的な教訓をまとめます。

## 症状

- app.diagrams.net（Web 版）でファイルを開くと `d.setId is not a function` が出て開けない。
- VS Code の Draw.io Integration 拡張でも同じエラーが出る。
- つまりクライアントに依存した問題ではなく、**ファイルの内容に起因**する再現性のある失敗。
- 同じディレクトリの別の `.drawio` ファイルは正常に開ける。

## 切り分けの経緯

まず「XML として壊れているのでは」と疑い、テキストエディタで開いて確認した。パーサは通っており、well-formed だった。

次に考えたのは mxCell の `id` 重複、空 `id`、HTML コメント混入あたり。しかし grep をかけても見当たらない。

「開けるファイル」と「開けないファイル」を diff して構造を比較した。二つのファイルのセル数・属性の種類はほぼ同じ。決定的に違うのは、問題のファイルの**特定セルの `id` 属性の値**だった。開けるファイルの id は `xxxx-1` のような自動採番形式。開けないファイルには `push` という値を持つセルがあった。

この時点で「`push` という文字列が何かと衝突しているのでは」と仮説を立て、ソースを掘ることにした。

## 真因：Array.prototype とのプロトタイプ衝突

draw.io は内部で mxGraph を使っており、XML のデコードには `mxCodec` が使われる。`mxCodec` は「ID → デコード済みオブジェクト」のキャッシュを保持するが、このキャッシュが**プレーンな配列**で初期化されている（`this.objects = []` 相当）。

XML をデコードする過程で既存オブジェクトを参照するとき、`mxObjectCodec` は `dec.objects[id]` という形でキャッシュを引く。通常の id（`xxxx-1` のような値）でこれを評価すると、配列に存在しない要素として `undefined` が返り、新しいオブジェクトの生成に進む。

問題のファイルには `id="push"` のセルがあった。`dec.objects["push"]` を評価すると何が起きるか。配列にそのインデックスは存在しないが、**プロトタイプチェーンを辿って `Array.prototype.push`（関数）**が見つかってしまう。

結果として、本来 mxCell であるべき `obj` が「`push` 関数」になる。続く `mxCellCodec.beforeDecode` の中で `obj.setId(...)` が呼ばれるが、関数オブジェクトに `setId` メソッドは存在しないため `d.setId is not a function`（`d` = `push` 関数）で落ちる、というのが全容だ。

正常に開ける他のファイルは、draw.io が保存時に id を衝突しない値へ自動採番していたため、この問題が起きなかった。

## 最小再現

以下のような `.drawio` ファイルで再現する。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel>
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="push" value="問題のセル" vertex="1" parent="1">
      <mxGeometry x="100" y="100" width="120" height="60" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>
```

`id="push"` を `id="push-node"` など衝突しない名前に変えるだけで正常に開ける。

Node 上で mxGraph のデコーダに通す検証でも確認済み。`id="push"` 版は `obj.setId is not a function` を再現し、改名版は全セルを正常にデコードできた。

## 修正方法

### 直接編集する

問題のファイルをテキストエディタで開き、該当セルの `id` を予約名と衝突しない値に変更する。そのセルを `source` / `target` で参照している edge があれば、そちらも追従させる。

```xml
<!-- 変更前 -->
<mxCell id="push" ... />
<mxCell id="edge-1" source="push" target="other" ... />

<!-- 変更後 -->
<mxCell id="push-node" ... />
<mxCell id="edge-1" source="push-node" target="other" ... />
```

### draw.io で一度開いて保存し直す

ただしこの方法では、エラーが出て開けないためファイルを開く前の段階で詰まる。一時的に `id` をテキスト置換してから開き直し、draw.io が自動採番した状態で保存すると以降は問題が起きなくなる。

### 衝突する可能性がある id の例

`push` だけが危険なわけではない。`Array.prototype` のメンバ名全般と、`Object.prototype` のメンバ名全般が衝突候補になる。

| 由来               | 衝突する id の例                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `Array.prototype`  | `push`, `pop`, `shift`, `unshift`, `slice`, `splice`, `map`, `filter`, `find`, `forEach`, `length` |
| `Object.prototype` | `constructor`, `hasOwnProperty`, `toString`, `valueOf`, `isPrototypeOf`, `__proto__`               |

手書きで id を設定する場合は、これらの名前を避けるか、`xxxx-` のようなプレフィクスを付けておくと安全だ。

## 一般化した教訓：オブジェクトや配列をハッシュマップに使うリスク

この問題は draw.io 固有の話ではなく、JavaScript / TypeScript でよく見る設計パターンの落とし穴だ。

### 問題のパターン

「任意のキーを持つ連想配列が欲しい」とき、プレーンなオブジェクトや配列を使いがちだ。

```typescript
// オブジェクトを連想配列代わりに使う
const cache: Record<string, MyObject> = {};
cache['someKey'] = obj;

// 配列を連想配列代わりに使う（今回の mxCodec のケース）
const objects: MyObject[] = [];
objects['someKey'] = obj;
```

このとき `someKey` が `push`・`constructor`・`hasOwnProperty` などプロトタイプのメンバ名と一致すると、意図しない値（多くの場合、関数）が取得されてしまう。

```typescript
const m: Record<string, unknown> = {};
console.log(m['push']); // → function push() { [native code] }
console.log(m['constructor']); // → function Object() { [native code] }
console.log(m['hasOwnProperty']); // → function hasOwnProperty() { [native code] }

const a: unknown[] = [];
console.log(a['push']); // → function push() { [native code] }
console.log(a['map']); // → function map() { [native code] }
```

TypeScript で `Record<string, MyObject>` と型を付けていても、これは実行時のプロトタイプ解決を止めてくれない。型チェックは通るのに実行時に壊れる、という見つけにくいバグになる。

これはプロトタイプ汚染（prototype pollution）と地続きのリスクでもある。外部から受け取ったキーが `__proto__` や `constructor` だった場合、オブジェクトのプロトタイプを書き換えられてしまう攻撃が成立する。

### 安全な代替手段

**1. `Map` を使う**

`Map` はキーと値のペアを完全に独立して管理する。プロトタイプを一切参照しないため、キーが何であっても衝突しない。

```typescript
const cache = new Map<string, MyObject>();
cache.set('push', obj); // プロトタイプとは無関係
console.log(cache.get('push')); // → obj（期待通り）

// 存在チェックも安全
console.log(cache.has('constructor')); // → false（プロトタイプを参照しない）
```

**2. `Object.create(null)` でプロトタイプなしオブジェクトを作る**

どうしてもオブジェクトリテラルを使いたい場合は、プロトタイプを持たないオブジェクトを作る。

```typescript
const cache = Object.create(null) as Record<string, MyObject>;
console.log(cache['push']); // → undefined（プロトタイプがないため）
console.log(cache['constructor']); // → undefined
```

ただし `toString` や `hasOwnProperty` も使えなくなるため注意が必要だ。

**3. 存在確認を `hasOwnProperty` で行う**

既存コードを大きく変えられない場合は、プロトタイプのメンバを拾わないよう存在確認を入れる。

```typescript
const cache: Record<string, MyObject> = {};

function get(key: string): MyObject | undefined {
  if (Object.prototype.hasOwnProperty.call(cache, key)) {
    return cache[key];
  }
  return undefined;
}
```

`cache.hasOwnProperty(key)` でも動くが、プロトタイプ汚染でオブジェクト自体の `hasOwnProperty` が書き換えられているケースに備えるなら `Object.prototype.hasOwnProperty.call(cache, key)` の形が確実だ。

### TypeScript の型は実行時のプロトタイプ解決を守ってくれない

`Record<string, T>` という型は「文字列キーに対して `T` が返る」ことを宣言しているが、プロトタイプを経由した値の取得を型システムは把握していない。型チェックが通っているからといって安心してはいけない。

ハッシュマップ用途には `Map` を使う、というのが一番シンプルで安全な指針だ。

## 実装ノート

今回こちらで直接手を入れられたのは、自分たちが管理している図ファイルの `id` だけだった（バグ自体は draw.io / mxGraph 側の実装に起因するため、外から直すことはできない）。とはいえ教訓は自分のコードにそのまま跳ね返ってくる。動的な文字列をキーにするハッシュマップを書くときは、最初から `Map` を選ぶ——というのを既定の方針にしておくと、同種のバグを未然に防げる。キーが固定（ドメイン定義済みのリテラルユニオン）の場合は、オブジェクトリテラルのままでも問題は起きない。

TypeScript の `noUncheckedIndexedAccess` を有効にすると `cache[key]` の戻り値が `T | undefined` になり、未確認アクセスで型エラーになる。`Record<string, T>` を使いつつも存在確認を強制できるため、有効にしておくと良い（`typescript-strict-repository` の記事でも触れている）。

## まとめ

- draw.io の `d.setId is not a function` は、mxGraph のデコーダが配列をキャッシュに使っており、セルの `id` が `Array.prototype` のメンバ名（`push` など）と衝突すると発生する。
- 修正は単純で、問題のある `id` を衝突しない名前に変えるだけでよい。
- 根本的な教訓は「**プレーンなオブジェクトや配列を任意のキーを持つハッシュマップとして使うと、プロトタイプのメンバ名と衝突したときに壊れる**」こと。TypeScript の型はこのリスクを防いでくれない。
- ハッシュマップ用途には `Map` を使う。動的なキーを受け取るオブジェクトが必要なら `Object.create(null)` か `hasOwnProperty` ガードを加える。
