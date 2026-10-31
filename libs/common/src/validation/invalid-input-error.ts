/**
 * 呼び出し側が渡した値が規則に合わないことを表す例外。
 *
 * 受け手 (API ルートなど) は文言ではなくクラスで 400 に振り分ける。文言で照合すると、
 * 文言を変えたときに黙って 500 になるため。名前に `Invalid` を含めるのは、
 * `@nagiyu/nextjs` の `handleApiError` が名前で 400 に振り分けるのに合わせるため。
 */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}
