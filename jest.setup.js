require('@testing-library/jest-dom');
const React = require('react');

jest.mock('lucide-react', () => {
    return new Proxy({}, {
        get: function (target, prop) {
            if (prop === '__esModule') return true;
            return function MockIcon() {
                return React.createElement('div', { 'data-testid': 'icon-' + prop });
            };
        }
    });
});
