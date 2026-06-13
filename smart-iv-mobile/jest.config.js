module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['./jest-setup.js'],
  moduleNameMapper: {
    '.*mockComponent$': '<rootDir>/jest-mockComponent.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};
