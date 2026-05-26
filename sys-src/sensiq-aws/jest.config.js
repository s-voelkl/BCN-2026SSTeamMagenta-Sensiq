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
    'lib/**/*.ts',
    'bin/**/*.ts'
  ],
};