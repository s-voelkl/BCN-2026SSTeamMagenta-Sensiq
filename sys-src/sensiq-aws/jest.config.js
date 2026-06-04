module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  setupFilesAfterEnv: [],
  collectCoverage: true,
  collectCoverageFrom: [
    'infra/**/*.ts',
    'bin/**/*.ts'
  ],
  coverageDirectory: 'coverage/jest-aws-coverage',
};