const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Block the Desktop-level node_modules so Metro never resolves
// react-native-reanimated or react-native-worklets from the parent folder
config.resolver.blockList = [
    /\/Users\/mohammedshakeeb\/Desktop\/node_modules\/.*/,
];

const wsShimPath = path.resolve(__dirname, 'shims/ws.js');

config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    ws: wsShimPath,
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === 'ws') {
        return {
            filePath: wsShimPath,
            type: 'sourceFile',
        };
    }
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
