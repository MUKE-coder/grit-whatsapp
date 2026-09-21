import { forwardRef } from "react";
import { Pressable, type PressableProps, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends PressableProps {
  /** Scale at full press. Defaults to 0.965 — subtle, iOS-app feel. */
  pressScale?: number;
  /** Tailwind class string (NativeWind). */
  className?: string;
}

/**
 * Press-state primitive with the spring-scale micro-interaction every
 * native app uses: scales down to ~96.5% on press-in, releases with a
 * critically-damped spring. Drop-in replacement for TouchableOpacity.
 */
export const PressableScale = forwardRef<typeof AnimatedPressable, PressableScaleProps>(
  function PressableScale(
    { pressScale = 0.965, style, onPressIn, onPressOut, children, ...rest },
    ref
  ) {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <AnimatedPressable
        ref={ref as never}
        onPressIn={(e) => {
          scale.value = withSpring(pressScale, { damping: 18, stiffness: 320, mass: 0.6 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, { damping: 16, stiffness: 260, mass: 0.6 });
          onPressOut?.(e);
        }}
        style={[animatedStyle, style as ViewStyle]}
        {...rest}
      >
        {children as never}
      </AnimatedPressable>
    );
  }
);
