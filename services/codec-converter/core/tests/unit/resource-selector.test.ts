import { selectJobDefinition } from '../../src/resource-selector.js';
import type { CodecType } from '../../src/types.js';

describe('selectJobDefinition', () => {
  describe('ファイルサイズ < 100MB', () => {
    const smallFileSize = 50 * 1024 * 1024; // 50MB

    it('h264 の場合は small を返す', () => {
      const result = selectJobDefinition(smallFileSize, 'h264');
      expect(result).toBe('small');
    });

    it('vp9 の場合は small を返す', () => {
      const result = selectJobDefinition(smallFileSize, 'vp9');
      expect(result).toBe('small');
    });

    it('av1 の場合は medium を返す', () => {
      const result = selectJobDefinition(smallFileSize, 'av1');
      expect(result).toBe('medium');
    });
  });

  describe('ファイルサイズ 100-300MB', () => {
    const mediumFileSize = 200 * 1024 * 1024; // 200MB

    it('h264 の場合は medium を返す', () => {
      const result = selectJobDefinition(mediumFileSize, 'h264');
      expect(result).toBe('medium');
    });

    it('vp9 の場合は large を返す', () => {
      const result = selectJobDefinition(mediumFileSize, 'vp9');
      expect(result).toBe('large');
    });

    it('av1 の場合は large を返す', () => {
      const result = selectJobDefinition(mediumFileSize, 'av1');
      expect(result).toBe('large');
    });
  });

  describe('ファイルサイズ > 300MB', () => {
    const largeFileSize = 400 * 1024 * 1024; // 400MB

    it('h264 の場合は medium を返す', () => {
      const result = selectJobDefinition(largeFileSize, 'h264');
      expect(result).toBe('medium');
    });

    it('vp9 の場合は large を返す', () => {
      const result = selectJobDefinition(largeFileSize, 'vp9');
      expect(result).toBe('large');
    });

    it('av1 の場合は xlarge を返す', () => {
      const result = selectJobDefinition(largeFileSize, 'av1');
      expect(result).toBe('xlarge');
    });
  });

  describe('境界値テスト', () => {
    it('ファイルサイズちょうど 100MB (h264) の場合は medium を返す', () => {
      const fileSize = 100 * 1024 * 1024; // 100MB
      const result = selectJobDefinition(fileSize, 'h264');
      expect(result).toBe('medium');
    });

    it('ファイルサイズちょうど 100MB (vp9) の場合は large を返す', () => {
      const fileSize = 100 * 1024 * 1024; // 100MB
      const result = selectJobDefinition(fileSize, 'vp9');
      expect(result).toBe('large');
    });

    it('ファイルサイズちょうど 100MB (av1) の場合は large を返す', () => {
      const fileSize = 100 * 1024 * 1024; // 100MB
      const result = selectJobDefinition(fileSize, 'av1');
      expect(result).toBe('large');
    });

    it('ファイルサイズ 99.9MB (h264) の場合は small を返す', () => {
      const fileSize = 100 * 1024 * 1024 - 1; // 100MB - 1バイト
      const result = selectJobDefinition(fileSize, 'h264');
      expect(result).toBe('small');
    });

    it('ファイルサイズちょうど 300MB (h264) の場合は medium を返す', () => {
      const fileSize = 300 * 1024 * 1024; // 300MB
      const result = selectJobDefinition(fileSize, 'h264');
      expect(result).toBe('medium');
    });

    it('ファイルサイズちょうど 300MB (vp9) の場合は large を返す', () => {
      const fileSize = 300 * 1024 * 1024; // 300MB
      const result = selectJobDefinition(fileSize, 'vp9');
      expect(result).toBe('large');
    });

    it('ファイルサイズちょうど 300MB (av1) の場合は xlarge を返す', () => {
      const fileSize = 300 * 1024 * 1024; // 300MB
      const result = selectJobDefinition(fileSize, 'av1');
      expect(result).toBe('xlarge');
    });

    it('ファイルサイズ 299.9MB (av1) の場合は large を返す', () => {
      const fileSize = 300 * 1024 * 1024 - 1; // 300MB - 1バイト
      const result = selectJobDefinition(fileSize, 'av1');
      expect(result).toBe('large');
    });
  });

  describe('エッジケース', () => {
    it('ファイルサイズ 0MB の場合でも処理可能（h264）', () => {
      const result = selectJobDefinition(0, 'h264');
      expect(result).toBe('small');
    });

    it('ファイルサイズ 0MB の場合でも処理可能（av1）', () => {
      const result = selectJobDefinition(0, 'av1');
      expect(result).toBe('medium');
    });

    it('ファイルサイズ 500MB (h264) の場合は medium を返す', () => {
      const fileSize = 500 * 1024 * 1024; // 500MB
      const result = selectJobDefinition(fileSize, 'h264');
      expect(result).toBe('medium');
    });

    it('ファイルサイズ 500MB (av1) の場合は xlarge を返す', () => {
      const fileSize = 500 * 1024 * 1024; // 500MB
      const result = selectJobDefinition(fileSize, 'av1');
      expect(result).toBe('xlarge');
    });

    it('非常に大きなファイルサイズ (1GB, av1) の場合は xlarge を返す', () => {
      const fileSize = 1024 * 1024 * 1024; // 1GB
      const result = selectJobDefinition(fileSize, 'av1');
      expect(result).toBe('xlarge');
    });
  });

  describe('エラーハンドリング', () => {
    it('負のファイルサイズの場合はエラーをスローする', () => {
      expect(() => selectJobDefinition(-1, 'h264')).toThrow('ファイルサイズが不正です');
    });

    it('負のファイルサイズ（-100MB）の場合はエラーをスローする', () => {
      expect(() => selectJobDefinition(-100 * 1024 * 1024, 'h264')).toThrow(
        'ファイルサイズが不正です'
      );
    });

    it('不正なコーデックタイプの場合はエラーをスローする', () => {
      // TypeScript の型チェックを回避するため、意図的に CodecType にキャスト
      const invalidCodec = 'invalid' as CodecType;
      expect(() => selectJobDefinition(100 * 1024 * 1024, invalidCodec)).toThrow(
        'コーデックタイプが不正です'
      );
    });

    it('空文字のコーデックタイプの場合はエラーをスローする', () => {
      // TypeScript の型チェックを回避するため、意図的に CodecType にキャスト
      const emptyCodec = '' as CodecType;
      expect(() => selectJobDefinition(100 * 1024 * 1024, emptyCodec)).toThrow(
        'コーデックタイプが不正です'
      );
    });

    it('h265 などのサポート外コーデックの場合はエラーをスローする', () => {
      // TypeScript の型チェックを回避するため、意図的に CodecType にキャスト
      const unsupportedCodec = 'h265' as CodecType;
      expect(() => selectJobDefinition(100 * 1024 * 1024, unsupportedCodec)).toThrow(
        'コーデックタイプが不正です'
      );
    });
  });

  describe('全パターンの組み合わせ（リソース構成表の検証）', () => {
    const testCases: Array<{
      fileSize: number;
      codecType: CodecType;
      expected: string;
      description: string;
    }> = [
      {
        fileSize: 50 * 1024 * 1024,
        codecType: 'h264',
        expected: 'small',
        description: '< 100MB + h264 → small',
      },
      {
        fileSize: 50 * 1024 * 1024,
        codecType: 'vp9',
        expected: 'small',
        description: '< 100MB + vp9 → small',
      },
      {
        fileSize: 50 * 1024 * 1024,
        codecType: 'av1',
        expected: 'medium',
        description: '< 100MB + av1 → medium',
      },
      {
        fileSize: 200 * 1024 * 1024,
        codecType: 'h264',
        expected: 'medium',
        description: '100-300MB + h264 → medium',
      },
      {
        fileSize: 200 * 1024 * 1024,
        codecType: 'vp9',
        expected: 'large',
        description: '100-300MB + vp9 → large',
      },
      {
        fileSize: 200 * 1024 * 1024,
        codecType: 'av1',
        expected: 'large',
        description: '100-300MB + av1 → large',
      },
      {
        fileSize: 400 * 1024 * 1024,
        codecType: 'h264',
        expected: 'medium',
        description: '> 300MB + h264 → medium',
      },
      {
        fileSize: 400 * 1024 * 1024,
        codecType: 'vp9',
        expected: 'large',
        description: '> 300MB + vp9 → large',
      },
      {
        fileSize: 400 * 1024 * 1024,
        codecType: 'av1',
        expected: 'xlarge',
        description: '> 300MB + av1 → xlarge',
      },
    ];

    testCases.forEach(({ fileSize, codecType, expected, description }) => {
      it(description, () => {
        const result = selectJobDefinition(fileSize, codecType);
        expect(result).toBe(expected);
      });
    });
  });
});
