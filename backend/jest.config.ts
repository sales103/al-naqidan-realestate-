import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'CommonJS' } }] },
  // Only rewrite *relative* ESM specifiers. The previous pattern matched any
  // module ending in .js, including files inside node_modules, which broke
  // express's own resolution and stopped the API suite from even loading.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageThreshold: { global: { branches: 70, functions: 80, lines: 80 } },
  testTimeout: 30000,
  verbose: true,
};

export default config;
