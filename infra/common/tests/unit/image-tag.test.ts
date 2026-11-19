import { getImageTag } from '../../src/utils/image-tag';

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

  it('IMAGE_TAG が未指定なら latest を返す', () => {
    delete process.env.IMAGE_TAG;
    expect(getImageTag()).toBe('latest');
  });

  it('IMAGE_TAG が空文字なら latest を返す', () => {
    process.env.IMAGE_TAG = '';
    expect(getImageTag()).toBe('latest');
  });
});
