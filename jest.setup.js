/* eslint-env jest */
/**
 * Native modules have no implementation under Jest, and importing one throws,
 * which would take down any test that merely reaches it through an import.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    readDir: jest.fn(async () => []),
    readFile: jest.fn(async () => ''),
    writeFile: jest.fn(async () => undefined),
    moveFile: jest.fn(async () => undefined),
    unlink: jest.fn(async () => undefined),
    exists: jest.fn(async () => false),
    mkdir: jest.fn(async () => undefined),
    DocumentDirectoryPath: '/mock/documents',
    ExternalStorageDirectoryPath: '/storage/emulated/0',
  },
}));

jest.mock('sn-plugin-lib', () => ({}));
