module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/dist', '<rootDir>/src/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.ts$': '$1.js'
  }
};