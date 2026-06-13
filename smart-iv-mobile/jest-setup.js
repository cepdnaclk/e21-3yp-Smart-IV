jest.mock('react-native', () => {
  const React = require('react');
  const RealRN = jest.requireActual('react-native');
  
  const mockComponent = (name) => {
    const Component = (props) => {
      return React.createElement(name, props, props.children);
    };
    Component.displayName = name;
    return Component;
  };

  const mocked = {};
  Object.defineProperties(mocked, Object.getOwnPropertyDescriptors(RealRN));

  mocked.View = mockComponent('View');
  mocked.Text = mockComponent('Text');
  mocked.TouchableOpacity = mockComponent('TouchableOpacity');

  return mocked;
});

// Mock Expo Vector Icons
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: (props) => React.createElement('View', props),
    MaterialIcons: (props) => React.createElement('View', props),
  };
});

// Mock Async Storage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock AWS Amplify Auth
jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  confirmSignIn: jest.fn(),
  signOut: jest.fn(),
  fetchAuthSession: jest.fn(),
  fetchUserAttributes: jest.fn(),
}));

// Mock AWS Amplify PubSub
jest.mock('@aws-amplify/pubsub', () => {
  return {
    PubSub: jest.fn().mockImplementation(() => {
      return {
        subscribe: jest.fn().mockReturnValue({
          subscribe: jest.fn(),
        }),
      };
    }),
  };
});

// Mock Expo Constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      eas: {
        projectId: 'mock-project-id',
      },
    },
  },
}));

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
}));

// Mock Expo Router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));
