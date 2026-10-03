import {splitRecognisedText} from './lassoCard';

test('"front :: back" fills both sides', () => {
  expect(splitRecognisedText('Mitosis :: Cell division')).toEqual({
    front: 'Mitosis',
    back: 'Cell division',
  });
});

test('Q:/A: lines fill both sides', () => {
  expect(
    splitRecognisedText(
      'Q: Three branches?\nA: Legislative, executive, judicial',
    ),
  ).toEqual({
    front: 'Three branches?',
    back: 'Legislative, executive, judicial',
  });
});

test('anything else goes on the front, keeping its lines', () => {
  expect(splitRecognisedText('  What is\nphotosynthesis?\r\n')).toEqual({
    front: 'What is\nphotosynthesis?',
    back: '',
  });
  // Two cards' worth is not one card: keep it all for the user to sort out.
  expect(splitRecognisedText('a :: 1\nb :: 2')).toEqual({
    front: 'a :: 1\nb :: 2',
    back: '',
  });
});

describe('pageSizeFor (lasso in notes and in PDFs)', () => {
  const sdk = require('sn-plugin-lib');
  const {pageSizeFor} = require('./lassoCard');
  beforeEach(() => {
    sdk.PluginFileAPI = {getPageSize: jest.fn()};
    sdk.PluginManager = {getDeviceType: jest.fn()};
  });

  test('uses the file’s own page size when it answers', async () => {
    sdk.PluginFileAPI.getPageSize.mockResolvedValue({
      success: true,
      result: {width: 1404, height: 1872},
    });
    expect(await pageSizeFor('/x.note', 0)).toEqual({
      width: 1404,
      height: 1872,
    });
  });

  test('a PDF that the note API cannot answer for falls back to the device size', async () => {
    sdk.PluginFileAPI.getPageSize.mockResolvedValue({success: false});
    sdk.PluginManager.getDeviceType.mockResolvedValue(5); // Manta
    expect(await pageSizeFor('/book.pdf', 3)).toEqual({
      width: 1920,
      height: 2560,
    });
    sdk.PluginFileAPI.getPageSize.mockRejectedValue(new Error('not a note'));
    sdk.PluginManager.getDeviceType.mockResolvedValue(4); // Nomad
    expect(await pageSizeFor('/book.pdf', 3)).toEqual({
      width: 1404,
      height: 1872,
    });
  });
});
