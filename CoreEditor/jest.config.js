/** @type { import('ts-jest').JestConfigWithTsJest } */

// eslint-disable-next-line no-undef
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/test/utils/setup.ts'],
  moduleNameMapper: {
    // Vite ?raw / ?inline asset imports are stubbed in tests
    '\\?(raw|inline)$': '<rootDir>/test/utils/assetStub.ts',
    // marked is ESM-only; the preview module isn't tested, so stub it under Jest
    '^marked$': '<rootDir>/test/utils/markedStub.ts',
  },
};
