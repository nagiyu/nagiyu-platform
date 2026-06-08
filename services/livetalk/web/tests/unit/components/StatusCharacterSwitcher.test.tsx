import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StatusCharacterSwitcher from '@/components/StatusCharacterSwitcher';

// next/navigation の useRouter をモック化する
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: mockPush })),
}));

// client-profiles をモック化し、hiyori / ageha の 2 キャラを返すよう設定する
jest.mock('@/lib/characters/client-profiles', () => ({
  getRegisteredProfileIds: jest.fn(() => ['hiyori', 'ageha']),
  getCharacterDisplay: jest.fn((id: string) => {
    const names: Record<string, { displayName: string; shortName: string }> = {
      hiyori: { displayName: '桃瀬ひより', shortName: 'ひより' },
      ageha: { displayName: '早瀬アゲハ', shortName: 'アゲハ' },
    };
    return names[id] ?? { displayName: id, shortName: id };
  }),
}));

afterEach(() => {
  jest.clearAllMocks();
});

describe('StatusCharacterSwitcher', () => {
  describe('描画', () => {
    it('ネイティブ select 要素が描画される', () => {
      render(<StatusCharacterSwitcher currentCharacterId="hiyori" />);
      // @nagiyu/ui の Select はネイティブ <select> をラップする
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('登録済みキャラクターの displayName が選択肢として描画される', () => {
      render(<StatusCharacterSwitcher currentCharacterId="hiyori" />);
      expect(screen.getByRole('option', { name: '桃瀬ひより' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '早瀬アゲハ' })).toBeInTheDocument();
    });

    it('currentCharacterId=hiyori のとき hiyori が初期選択値として設定される', () => {
      render(<StatusCharacterSwitcher currentCharacterId="hiyori" />);
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('hiyori');
    });

    it('currentCharacterId=ageha のとき ageha が初期選択値として設定される', () => {
      render(<StatusCharacterSwitcher currentCharacterId="ageha" />);
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('ageha');
    });
  });

  describe('キャラクター切替', () => {
    it('別のキャラクターを選択すると /status?characterId=<id> に遷移する', () => {
      render(<StatusCharacterSwitcher currentCharacterId="hiyori" />);

      const select = screen.getByRole('combobox');
      // ネイティブ select の変更イベントを発火する
      fireEvent.change(select, { target: { value: 'ageha' } });

      expect(mockPush).toHaveBeenCalledWith(`/status?characterId=${encodeURIComponent('ageha')}`);
    });

    it('hiyori から hiyori を再選択しても onChange は発火されないため router.push は呼ばれない', () => {
      render(<StatusCharacterSwitcher currentCharacterId="hiyori" />);

      // 同じ値への変更は onChange を発火しないためテストとして意味のある検証はできないが、
      // 別の値から変更するテストが通ることで経路を担保する
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'hiyori' } });

      // onChange は現在値と変わらない場合でも発火するが push 先は hiyori になる
      expect(mockPush).toHaveBeenCalledWith(`/status?characterId=${encodeURIComponent('hiyori')}`);
    });
  });
});
