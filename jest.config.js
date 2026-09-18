/** @type {import('jest').Config} */
export default {
  // package.json has `"type": "module"`, which makes jest treat `.js` as ESM.
  // `.ts` has to be declared separately.
  extensionsToTreatAsEsm: ['.ts'],

  // Babel only strips the types; the ESM syntax is left for jest to load
  // natively (via NODE_OPTIONS=--experimental-vm-modules).
  transform: {
    '^.+\\.ts$': [
      'babel-jest',
      {
        configFile: false,
        babelrc: false,
        presets: [
          ['@babel/preset-typescript', { onlyRemoveTypeImports: true }],
        ],
      },
    ],
  },

  // TypeScript resolves `./foo.js` to `foo.ts` and emits the `.js` specifier.
  // Jest resolves the specifier literally, so it needs the extension dropped.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  testMatch: ['**/__tests__/**/*-test.ts'],
};
