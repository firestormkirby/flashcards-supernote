jest.mock('sn-plugin-lib', () => ({
  PluginDocAPI: {getLastSelectedText: jest.fn()},
  PluginCommAPI: {},
  PluginFileAPI: {},
  PluginManager: {},
}));

import {PluginDocAPI} from 'sn-plugin-lib';
import {captureDocSelection, cleanSelectedText} from './docSelection';

const selected = PluginDocAPI.getLastSelectedText as jest.Mock;

describe('cleanSelectedText', () => {
  test('rejoins the page’s hard line breaks and hyphenated words', () => {
    expect(
      cleanSelectedText(
        'Photo-\nsynthesis turns light\ninto chemical\r\nenergy.',
      ),
    ).toBe('Photosynthesis turns light into chemical energy.');
  });

  test('keeps paragraph breaks and real hyphens', () => {
    expect(
      cleanSelectedText('Long-term memory\n\n  Second   para-\ngraph '),
    ).toBe('Long-term memory\n\nSecond paragraph');
    // A capital after the break means a real hyphenated compound, so the hyphen stays.
    expect(cleanSelectedText('Franco-\nPrussian War')).toBe(
      'Franco-Prussian War',
    );
  });

  test('drops soft hyphens', () => {
    expect(cleanSelectedText('mito­chondria')).toBe('mitochondria');
  });
});

describe('captureDocSelection', () => {
  test('selected text goes on the front', async () => {
    selected.mockResolvedValue({
      success: true,
      result: 'The mitochondria\nis the powerhouse',
    });
    const r = await captureDocSelection();
    expect(r.front).toBe('The mitochondria is the powerhouse');
    expect(r.back).toBe('');
    expect(r.note).toMatch(/Swap sides/);
  });

  test('"term :: definition" fills both sides', async () => {
    selected.mockResolvedValue({
      success: true,
      result: 'Osmosis :: water crossing a membrane',
    });
    const r = await captureDocSelection();
    expect([r.front, r.back]).toEqual(['Osmosis', 'water crossing a membrane']);
  });

  test('nothing selected, or the call fails, still opens an empty editor with a note', async () => {
    selected.mockResolvedValue({success: true, result: '  '});
    expect(await captureDocSelection()).toMatchObject({
      front: '',
      back: '',
      note: expect.stringMatching(/Select some text/),
    });
    selected.mockRejectedValue(new Error('no doc'));
    expect(await captureDocSelection()).toMatchObject({
      front: '',
      back: '',
      note: expect.stringMatching(/failed/),
    });
  });
});
