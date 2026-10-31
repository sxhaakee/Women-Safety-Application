const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Block the Desktop-level node_modules so Metro never resolves
// react-native-reanimated or react-native-worklets from the parent folder
config.resolver.blockList = [
    /\/Users\/mohammedshakeeb\/Desktop\/node_modules\/.*/,
];

module.exports = config;
