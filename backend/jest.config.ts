import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'CommonJS' } }] },
  moduleNameMapper: { '^(.+)\\.js$': '$1' },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageThreshold: { global: { branches: 70, functions: 80, lines: 80 } },
  testTimeout: 30000,
  verbose: true,
};

export default config;
