/**
 * @nagiyu/* だけ `import` 条件で解決する Jest リゾルバ。
 *
 * 公開版の lib は ESM で、exports に `types` と `import` の条件しか持たない。
 * Jest (CJS) の既定条件 (`require` / `default`) では解決できないため、@nagiyu/* に限って `import` を足す。
 * 他のパッケージまで `import` 条件にすると、依存が ESM 版を返して CJS の Jest で読めなくなるため、対象を絞る。
 */
module.exports = (request, options) => {
  if (request.startsWith('@nagiyu/')) {
    return options.defaultResolver(request, {
      ...options,
      conditions: ['import', 'node', 'default'],
    });
  }
  return options.defaultResolver(request, options);
};
