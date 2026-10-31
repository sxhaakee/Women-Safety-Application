// Shim for 'ws' in React Native / Expo environment
// React Native provides global WebSocket implementation natively.

const WS = typeof WebSocket !== 'undefined' ? WebSocket : null;

module.exports = WS;
module.exports.default = WS;
module.exports.WebSocket = WS;
