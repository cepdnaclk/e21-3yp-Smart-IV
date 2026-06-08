const React = require('react');
const path = require('path');

function mockComponent(moduleName, instanceMethods, isESModule) {
  let actualPath = moduleName;
  if (moduleName.startsWith('.')) {
    // Resolve relative path relative to node_modules/react-native/jest
    // because that's where mockComponent originally resides.
    actualPath = path.resolve(__dirname, 'node_modules/react-native/jest', moduleName);
  }

  const RealComponent = isESModule
    ? jest.requireActual(actualPath).default
    : jest.requireActual(actualPath);

  const hasComponentPrototype =
    RealComponent &&
    typeof RealComponent === 'function' &&
    RealComponent.prototype &&
    RealComponent.prototype.constructor &&
    (RealComponent.prototype instanceof React.Component ||
     RealComponent.prototype.constructor instanceof React.Component ||
     RealComponent.prototype.constructor.prototype instanceof React.Component);

  const SuperClass = hasComponentPrototype ? RealComponent : React.Component;

  const name =
    (RealComponent && (RealComponent.displayName ?? RealComponent.name)) ??
    (RealComponent && RealComponent.render && (RealComponent.render.displayName ?? RealComponent.render.name)) ??
    'Unknown';

  const nameWithoutPrefix = name.replace(/^(RCT|RK)/, '');

  const Component = class extends SuperClass {
    static displayName = 'Component';

    render() {
      const defaultProps = RealComponent ? RealComponent.defaultProps : null;
      const props = { ...defaultProps };

      if (this.props) {
        Object.keys(this.props).forEach(prop => {
          if (this.props[prop] !== undefined) {
            props[prop] = this.props[prop];
          }
        });
      }

      return React.createElement(nameWithoutPrefix, props, this.props.children);
    }
  };

  Object.defineProperty(Component, 'name', {
    value: name,
    writable: false,
    enumerable: false,
    configurable: true,
  });

  Component.displayName = nameWithoutPrefix;

  if (RealComponent) {
    Object.keys(RealComponent).forEach(classStatic => {
      try {
        Component[classStatic] = RealComponent[classStatic];
      } catch (e) {
        // Ignore read-only assignment errors
      }
    });
  }

  if (instanceMethods != null) {
    Object.assign(Component.prototype, instanceMethods);
  }

  return Component;
}

module.exports = {
  __esModule: true,
  default: mockComponent,
};
