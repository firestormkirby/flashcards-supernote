module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Theme colours come from context, so most styles are computed per render.
    'react-native/no-inline-styles': 'off',
    curly: 'off',
  },
  ignorePatterns: ['src/core/examples.generated.ts', 'android/', 'build/', 'buildgenerated/', 'node_modules/'],
};
