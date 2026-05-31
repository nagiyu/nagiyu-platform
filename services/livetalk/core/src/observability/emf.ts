/**
 * CloudWatch Embedded Metric Format (EMF) のペイロードを組み立てる。
 *
 * stdout への console.log 出力だけで CloudWatch が自動メトリクス化する仕組み。
 * ECS → CloudWatch Logs → CloudWatch Metrics の経路で、追加の IAM 権限・
 * インフラ変更は不要。
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
 */

export type EmfUnit = 'Count' | 'Milliseconds' | 'Bytes' | 'None' | 'Percent' | 'Seconds';

export interface EmfMetricDefinition {
  name: string;
  value: number;
  unit: EmfUnit;
}

export interface EmfPayloadOptions {
  namespace: string;
  /** Dimension キー → 値 のマップ。順序は保持される。 */
  dimensions: Record<string, string>;
  metrics: EmfMetricDefinition[];
  /** Unix ms タイムスタンプ。省略時は呼び出し時刻を使う。 */
  timestamp?: number;
}

export function buildEmfPayload(options: EmfPayloadOptions): string {
  const { namespace, dimensions, metrics, timestamp = Date.now() } = options;
  const dimensionKeys = Object.keys(dimensions);

  const emfObject: Record<string, unknown> = {
    _aws: {
      Timestamp: timestamp,
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [dimensionKeys],
          Metrics: metrics.map((m) => ({ Name: m.name, Unit: m.unit })),
        },
      ],
    },
    ...dimensions,
  };

  for (const m of metrics) {
    emfObject[m.name] = m.value;
  }

  return JSON.stringify(emfObject);
}
