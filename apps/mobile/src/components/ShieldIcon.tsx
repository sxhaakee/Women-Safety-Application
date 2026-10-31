import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

interface ShieldIconProps {
    size?: number;
    color?: string;
}

export default function ShieldIcon({ size = 64, color = '#C0392B' }: ShieldIconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
            {/* Shield outer */}
            <Path
                d="M32 4 L56 16 V32 C56 46.36 45.48 57.84 32 60 C18.52 57.84 8 46.36 8 32 V16 L32 4Z"
                fill={color}
                opacity={0.15}
                stroke={color}
                strokeWidth={2.5}
            />
            {/* Shield inner */}
            <Path
                d="M32 10 L50 19 V32 C50 43.5 42.2 52.7 32 54.8 C21.8 52.7 14 43.5 14 32 V19 L32 10Z"
                fill={color}
                opacity={0.3}
            />
            {/* S letter */}
            <Path
                d="M26 26 C26 23.5 28.5 22 32 22 C35.5 22 38 23.5 38 26 C38 28.5 35 29 32 30 C29 31 26 31.5 26 34 C26 36.5 28.5 38 32 38 C35.5 38 38 36.5 38 34"
                stroke="white"
                strokeWidth={3}
                strokeLinecap="round"
                fill="none"
            />
        </Svg>
    );
}
