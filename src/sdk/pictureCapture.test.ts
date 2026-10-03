jest.mock('sn-plugin-lib', () => ({
  PluginCommAPI: {
    getCurrentFilePath: jest.fn(),
    getCurrentPageNum: jest.fn(),
    generateLassoPreview: jest.fn(),
  },
  PluginDocAPI: {generateCurrentDocImage: jest.fn()},
  PluginNoteAPI: {generateLayerPreviewImage: jest.fn()},
  PluginFileAPI: {getPageSize: jest.fn(), generateNotePng: jest.fn()},
  PluginManager: {
    hasPermission: jest.fn(async () => 1),
    getDeviceType: jest.fn(async () => 5),
  },
  NativePluginManager: {getPluginDirPath: jest.fn(async () => '/plugin/data')},
}));

import {Image} from 'react-native';
import RNFS from 'react-native-fs';
import {
  PluginCommAPI,
  PluginDocAPI,
  PluginFileAPI,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import {captureLassoPicture, capturePage, isDocPath} from './pictureCapture';

const fs = RNFS as unknown as {exists: jest.Mock};
const comm = PluginCommAPI as unknown as Record<string, jest.Mock>;
const doc = PluginDocAPI as unknown as Record<string, jest.Mock>;
const note = PluginNoteAPI as unknown as Record<string, jest.Mock>;
const file = PluginFileAPI as unknown as Record<string, jest.Mock>;

/** Makes Image.getSize report this size, or fail when null. */
function imageSize(size: {width: number; height: number} | null) {
  jest.spyOn(Image, 'getSize').mockImplementation((_uri, ok, fail) => {
    if (size) ok(size.width, size.height);
    else fail?.(new Error('unreadable'));
    return Promise.resolve({width: 0, height: 0}) as any;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  imageSize({width: 1920, height: 2560});
  fs.exists.mockResolvedValue(true);
  comm.getCurrentPageNum.mockResolvedValue({success: true, result: 4});
  file.getPageSize.mockResolvedValue({
    success: true,
    result: {width: 1920, height: 2560},
  });
});

test('isDocPath tells documents from notes', () => {
  expect(isDocPath('/Document/Biology.PDF')).toBe(true);
  expect(isDocPath('/Document/novel.epub')).toBe(true);
  expect(isDocPath('/Note/Lecture.note')).toBe(false);
});

test('a PDF page is rendered by the document reader, at the page size, into the images folder', async () => {
  comm.getCurrentFilePath.mockResolvedValue({
    success: true,
    result: '/Document/Biology.pdf',
  });
  doc.generateCurrentDocImage.mockResolvedValue({success: true, result: true});
  const r = await capturePage();
  expect(doc.generateCurrentDocImage).toHaveBeenCalledWith(
    4,
    expect.stringMatching(/^\/plugin\/data\/images\/page-.*\.png$/),
    {width: 1920, height: 2560},
    0, // without selection highlights
  );
  expect(note.generateLayerPreviewImage).not.toHaveBeenCalled();
  expect(r.image).toMatchObject({
    file: expect.stringMatching(/^page-/),
    width: 1920,
    height: 2560,
  });
  expect(r.image!.file).not.toContain('/'); // stored as a bare name
});

test('a note page renders its ink layer, falling back to the full page', async () => {
  comm.getCurrentFilePath.mockResolvedValue({
    success: true,
    result: '/Note/Lecture.note',
  });
  note.generateLayerPreviewImage.mockResolvedValue({success: true});
  await capturePage();
  expect(note.generateLayerPreviewImage).toHaveBeenCalledWith(
    '/Note/Lecture.note',
    4,
    0,
    expect.any(String),
  );
  expect(file.generateNotePng).not.toHaveBeenCalled();

  note.generateLayerPreviewImage.mockResolvedValue({success: false});
  file.generateNotePng.mockResolvedValue({success: true});
  const r = await capturePage();
  expect(file.generateNotePng).toHaveBeenCalledWith(
    expect.objectContaining({notePath: '/Note/Lecture.note', page: 4, type: 1}),
  );
  expect(r.image).toBeDefined();
});

test('a failed render explains itself instead of returning an image', async () => {
  comm.getCurrentFilePath.mockResolvedValue({
    success: true,
    result: '/Document/x.pdf',
  });
  doc.generateCurrentDocImage.mockResolvedValue({success: false});
  const r = await capturePage();
  expect(r.image).toBeUndefined();
  expect(r.note).toMatch(/couldn't be captured/);
});

test('a lasso becomes a picture of exactly the selection', async () => {
  comm.generateLassoPreview.mockResolvedValue({
    success: true,
    result: {
      imagePath: '',
      rect: {left: 100, top: 200, right: 400, bottom: 350},
    },
  });
  await captureLassoPicture();
  expect(comm.generateLassoPreview).toHaveBeenCalledWith(
    expect.stringMatching(/\/images\/lasso-.*\.png$/),
  );
  // The real size of the file is what counts (the preview can be scaled)…
  imageSize({width: 600, height: 300});
  expect((await captureLassoPicture()).image).toMatchObject({
    width: 600,
    height: 300,
  });
  // …and when the file can't be measured, the lasso rect stands in.
  imageSize(null);
  const r = await captureLassoPicture();
  expect(r.image).toMatchObject({width: 300, height: 150});
  expect(r.image!.crop).toBeUndefined();
});
