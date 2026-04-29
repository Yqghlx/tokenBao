/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        module: 'ESNext',
        target: 'ES2020',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        skipLibCheck: true,
        noEmit: false,
      },
      useESM: false,
    }],
  },
  moduleNameMapper: {
    '\\.css$': '<rootDir>/__tests__/styleMock.js',
  },
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
  globals: {
    __APP_VERSION__: '1.1.3',
  },
  testTimeout: 10000,
};
