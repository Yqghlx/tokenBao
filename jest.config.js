module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 10000,
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      // 测试编译使用包含测试目录的独立配置
      tsconfig: 'tsconfig.test.json'
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.ts$': '$1.js'
  }
};
