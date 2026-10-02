module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/build/', '<rootDir>/buildgenerated/'],
};
