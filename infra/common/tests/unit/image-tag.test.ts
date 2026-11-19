import { getImageTag, IMAGE_TAG_ERROR_MESSAGES } from '../../src/utils/image-tag';

describe('getImageTag', () => {
  const originalImageTag = process.env.IMAGE_TAG;

  afterEach(() => {
    if (originalImageTag === undefined) {
      delete process.env.IMAGE_TAG;
    } else {
      process.env.IMAGE_TAG = originalImageTag;
    }
  });

  it('IMAGE_TAG が指定されていればその値を返す', () => {
    process.env.IMAGE_TAG = 'abc1234';
    expect(getImageTag()).toBe('abc1234');
  });

  it('IMAGE_TAG が未指定なら例外を投げる', () => {
    delete process.env.IMAGE_TAG;
    expect(() => getImageTag()).toThrow(IMAGE_TAG_ERROR_MESSAGES.IMAGE_TAG_REQUIRED);
  });

  it('IMAGE_TAG が空文字なら例外を投げる', () => {
    process.env.IMAGE_TAG = '';
    expect(() => getImageTag()).toThrow(IMAGE_TAG_ERROR_MESSAGES.IMAGE_TAG_REQUIRED);
  });
});
