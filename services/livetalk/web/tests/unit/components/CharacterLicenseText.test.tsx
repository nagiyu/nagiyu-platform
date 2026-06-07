/**
 * CharacterLicenseText コンポーネントのユニットテスト。
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import CharacterLicenseText from '@/components/CharacterLicenseText';
import { CharacterProvider } from '@/lib/characters/CharacterContext';
import { getCharacterLicenseText } from '@/lib/characters/client-profiles';
import { DEFAULT_CLIENT_CHARACTER_ID } from '@/lib/characters/client-profiles';

describe('CharacterLicenseText', () => {
  it('選択中のキャラクター（既定: hiyori）の権利テキストを表示する', () => {
    render(
      <CharacterProvider>
        <CharacterLicenseText />
      </CharacterProvider>
    );
    const expectedText = getCharacterLicenseText(DEFAULT_CLIENT_CHARACTER_ID);
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it('VOICEVOX クレジットが含まれる', () => {
    render(
      <CharacterProvider>
        <CharacterLicenseText />
      </CharacterProvider>
    );
    expect(screen.getByText(/VOICEVOX/)).toBeInTheDocument();
  });

  it('Live2D クレジットが含まれる', () => {
    render(
      <CharacterProvider>
        <CharacterLicenseText />
      </CharacterProvider>
    );
    expect(screen.getByText(/Live2D/)).toBeInTheDocument();
  });
});
