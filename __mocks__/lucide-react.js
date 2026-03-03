const React = require('react');

module.exports = new Proxy({}, {
    get: function (target, prop) {
        if (prop === '__esModule') return true;
        const MockIcon = (props) => React.createElement('div', { ...props, 'data-testid': 'icon-' + prop });
        MockIcon.displayName = prop;
        return MockIcon;
    }
});
