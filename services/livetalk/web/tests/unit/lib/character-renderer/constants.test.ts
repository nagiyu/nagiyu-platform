import {
  HIYORI_MODEL_PATH,
  CUBISM_PARAMETER_MOUTH_OPEN_Y,
} from '@/lib/character-renderer/constants';

describe('character-renderer constants', () => {
  it('HIYORI_MODEL_PATH は S3 配信パスを指す', () => {
    expect(HIYORI_MODEL_PATH).toBe('/assets/characters/hiyori/runtime/hiyori_free_t08.model3.json');
  });

  it('CUBISM_PARAMETER_MOUTH_OPEN_Y は LipSync パラメータ ID と一致する', () => {
    expect(CUBISM_PARAMETER_MOUTH_OPEN_Y).toBe('ParamMouthOpenY');
  });
});
