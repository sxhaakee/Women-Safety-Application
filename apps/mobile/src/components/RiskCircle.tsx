import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { getRiskColor, getRiskLevel, Colors, FontSizes } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface RiskCircleProps {
    score: number;
    size?: number;
}

export default function RiskCircle({ score, size = 220 }: RiskCircleProps) {
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;
    const color = getRiskColor(score);
    const level = getRiskLevel(score);

    useEffect(() => {
        if (score > 60) {
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.08,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            );
            pulse.start();
            return () => pulse.stop();
        } else {
            pulseAnim.setValue(1);
        }
    }, [score]);

    return (
        <Animated.View style={[styles.container, { transform: [{ scale: pulseAnim }] }]}>
            {/* Glow effect for high risk */}
            {score > 60 && (
                <View
                    style={[
                        styles.glow,
                        {
                            width: size + 40,
                            height: size + 40,
                            borderRadius: (size + 40) / 2,
                            backgroundColor: color,
                            opacity: 0.15,
                        },
                    ]}
                />
            )}
            <Svg width={size} height={size} style={styles.svg}>
                {/* Background circle */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={Colors.surfaceLight}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                {/* Progress circle */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={circumference - progress}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>
            <View style={[styles.innerContent, { width: size, height: size }]}>
                <Text style={[styles.scoreText, { color }]}>{score}</Text>
                <Text style={[styles.levelText, { color }]}>{level}</Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    svg: {
        position: 'absolute',
    },
    glow: {
        position: 'absolute',
    },
    innerContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreText: {
        fontSize: FontSizes.mega,
        fontWeight: '800',
    },
    levelText: {
        fontSize: FontSizes.md,
        fontWeight: '700',
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
});
