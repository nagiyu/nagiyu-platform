/**
 * Stock Tracker Core - ProjectionExpression の組み立て
 */

/** ProjectionExpression とそのプレースホルダの対応 */
export interface ProjectionParts {
  ProjectionExpression: string;
  ExpressionAttributeNames: Record<string, string>;
}

/**
 * 保存属性のパスの一覧から ProjectionExpression を組み立てる。
 *
 * 属性名の直書きをやめ、Mapper が宣言した「読む属性」から式を作ることで、
 * Mapper の読み取りと射影のずれを防ぐ。パスの各要素 (ネストしたマップのキーを含む) は
 * 予約語や記号を含みうるため、すべてプレースホルダにする。
 *
 * @param paths - 属性のパス。ネストは `['Probabilities', 'DIR', 'probability']` のように並べる
 * @returns 式とプレースホルダ。他の式のプレースホルダと衝突しないよう `#proj` 接頭辞を付ける
 */
export function buildProjection(paths: readonly (readonly string[])[]): ProjectionParts {
  const placeholders = new Map<string, string>();
  const placeholderOf = (name: string): string => {
    let placeholder = placeholders.get(name);
    if (placeholder === undefined) {
      placeholder = `#proj${placeholders.size}`;
      placeholders.set(name, placeholder);
    }
    return placeholder;
  };

  const ProjectionExpression = paths
    .map((path) => path.map((name) => placeholderOf(name)).join('.'))
    .join(', ');

  const ExpressionAttributeNames: Record<string, string> = {};
  for (const [name, placeholder] of placeholders) {
    ExpressionAttributeNames[placeholder] = name;
  }
  return { ProjectionExpression, ExpressionAttributeNames };
}
