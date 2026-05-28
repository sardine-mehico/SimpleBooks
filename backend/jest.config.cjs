/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: { esModuleInterop: true, target: 'ES2022', module: 'commonjs', strictNullChecks: true, experimentalDecorators: true, emitDecoratorMetadata: true, types: ['jest', 'node'], jsx: 'react' } }],
  },
  // @react-pdf/renderer ships ESM-only and cannot be loaded by Jest's CommonJS
  // runtime. Map the whole package (and its deps) to an empty stub so that
  // unit tests that don't exercise PDF rendering still compile and run.
  moduleNameMapper: {
    '@react-pdf/renderer': '<rootDir>/src/__mocks__/react-pdf-renderer.js',
    '@react-pdf/primitives': '<rootDir>/src/__mocks__/react-pdf-primitives.js',
  },
};
