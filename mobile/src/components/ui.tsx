import { IconArrowLeft, IconArrowUpRight } from '@tabler/icons-react-native';
import { forwardRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, font, type Weight } from '../lib/theme';

// ── Type ──

const TONES = {
  text: colors.text,
  muted: colors.muted,
  faint: colors.faint,
  live: colors.live,
  liveText: colors.liveText,
  liveInk: colors.liveInk,
  autodj: colors.autodj,
  autodjText: colors.autodjText,
  pro: colors.pro,
  ok: colors.ok,
  ink: colors.bg,
} as const;

export type Tone = keyof typeof TONES;

/** Bricolage Grotesque by default; `mono` for clocks, slugs, labels and data. */
export function T({
  style,
  mono,
  weight = 500,
  size = 15,
  tone = 'text',
  tracking,
  lineHeight,
  ...props
}: TextProps & {
  mono?: boolean;
  weight?: Weight;
  size?: number;
  tone?: Tone;
  /** Letter spacing in em, as the comp writes it. */
  tracking?: number;
  /** Line height as a multiple of the size. */
  lineHeight?: number;
}) {
  return (
    <Text
      {...props}
      style={[
        font(weight, size, { mono, tracking, lineHeight }),
        { color: TONES[tone] },
        mono && styles.tabular,
        style,
      ]}
    />
  );
}

/** A big screen heading, with an optional action on the right. */
export function Heading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.heading}>
      <T weight={800} size={30} tracking={-0.035} style={{ lineHeight: 32 }}>
        {children}
      </T>
      {action}
    </View>
  );
}

/** "GoCast.fm" set in the display face, as in the comp's top bars. */
export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <T weight={700} size={size} tracking={-0.03} accessibilityLabel="GoCast">
      Go<T weight={700} size={size} tone="autodj">Cast</T>
      <T weight={700} size={size} tone="faint">.fm</T>
    </T>
  );
}

// ── Buttons ──

type ButtonVariant = 'light' | 'outline' | 'live' | 'liveInk' | 'dark' | 'subtle' | 'autodj' | 'pro';

const VARIANTS: Record<ButtonVariant, { bg: string; ink: string; border?: string; weight: Weight }> = {
  light: { bg: colors.text, ink: colors.bg, weight: 700 },
  outline: { bg: 'transparent', ink: colors.text, border: colors.border, weight: 600 },
  live: { bg: colors.live, ink: colors.liveInk, weight: 700 },
  liveInk: { bg: colors.liveInk, ink: colors.live, weight: 700 },
  dark: { bg: colors.raised, ink: colors.text, weight: 700 },
  subtle: { bg: colors.line, ink: colors.text, weight: 600 },
  autodj: { bg: 'transparent', ink: colors.autodjText, border: 'rgba(155,123,255,0.4)', weight: 600 },
  pro: { bg: colors.pro, ink: colors.proInk, weight: 700 },
};

/**
 * The comp's full-width buttons: 58 tall, 18 round. `dot` puts the small
 * status dot before the label ("● Go live").
 */
export function Button({
  label,
  variant = 'light',
  height = 58,
  radius = 18,
  size = 16,
  dot,
  icon,
  busy,
  disabled,
  style,
  ...props
}: Omit<PressableProps, 'style'> & {
  label: string;
  variant?: ButtonVariant;
  height?: number;
  radius?: number;
  size?: number;
  /** A dot before the label; true uses the label's colour. */
  dot?: boolean | string;
  icon?: ReactNode;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANTS[variant];
  const dotColor = dot === true ? v.ink : dot;
  const dotSize = height >= 60 ? 11 : height >= 56 ? 10 : 9;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...props}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { height, borderRadius: radius, backgroundColor: v.bg },
        v.border ? { borderWidth: 1.5, borderColor: v.border } : null,
        pressed && styles.pressed,
        (disabled || busy) && { opacity: 0.45 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={v.ink} />
      ) : (
        <>
          {icon}
          {!!dotColor && <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize, backgroundColor: dotColor }} />}
          <T weight={v.weight} size={size} style={{ color: v.ink }}>
            {label}
          </T>
        </>
      )}
    </Pressable>
  );
}

/** A small pill button: "+ Add", "Share", "Allow". */
export function PillButton({
  label,
  onPress,
  variant = 'light',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'light' | 'card';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={6}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: variant === 'light' ? colors.text : colors.card },
        pressed && styles.pressed,
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      <T weight={700} size={13} tone={variant === 'light' ? 'ink' : 'text'}>
        {label}
      </T>
    </Pressable>
  );
}

/** A text link in the accent violet; `external` adds the ↗ for links that leave the app. */
export function TextLink({
  label,
  onPress,
  size = 13,
  external,
}: {
  label: string;
  onPress: () => void;
  size?: number;
  external?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
    >
      <T weight={600} size={size} tone="autodjText">
        {label}
      </T>
      {external && <IconArrowUpRight size={size + 1} color={colors.autodjText} strokeWidth={2.25} />}
    </Pressable>
  );
}

/** The back arrow: a 44 touch target. */
export function BackButton({ onPress, size = 24 }: { onPress: () => void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
    >
      <IconArrowLeft size={size} color={colors.text} strokeWidth={2} />
    </Pressable>
  );
}

// ── Surfaces ──

export function Card({
  children,
  style,
  radius = 22,
  padding = 16,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  padding?: number;
}) {
  return <View style={[{ backgroundColor: colors.card, borderRadius: radius, padding }, style]}>{children}</View>;
}

// ── Status ──

/** A small mono tag: a feature on the welcome screen. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <View style={styles.chip}>
      <T mono weight={500} size={12}>
        {children}
      </T>
    </View>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />;
}

/** "● ON AIR · AUTODJ": a dot and a mono caps label. */
export function StateLabel({
  label,
  color,
  dotColor,
  size = 12,
  weight = 600,
}: {
  label: string;
  color: string;
  dotColor?: string;
  size?: number;
  weight?: Weight;
}) {
  return (
    <View style={styles.state}>
      <Dot color={dotColor ?? color} size={size >= 12 ? 8 : 7} />
      <T mono weight={weight} size={size} tracking={size >= 12 ? 0.1 : 0.08} style={{ color }}>
        {label}
      </T>
    </View>
  );
}

/** A small mono caps caption over a number: "LISTENING". */
export function Caption({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <T mono weight={500} size={11} tone="faint" tracking={0.06} style={style}>
      {children}
    </T>
  );
}

/** A thin progress bar. `fraction` is 0–1. */
export function Progress({
  fraction,
  color,
  track = 'rgba(244,241,236,0.1)',
  height = 4,
}: {
  fraction: number;
  color: string;
  track?: string;
  height?: number;
}) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${Math.min(1, Math.max(0, fraction)) * 100}%`, backgroundColor: color }} />
    </View>
  );
}

// ── Inputs ──

/**
 * Two or three mutually exclusive options. `look="inline"` is the audience
 * range picker (mono, hugs its labels); `look="fill"` shares the width.
 */
export function Segmented<V extends string | number | boolean>({
  value,
  options,
  onChange,
  look = 'fill',
  surface = colors.bg,
}: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  look?: 'inline' | 'fill';
  surface?: string;
}) {
  const inline = look === 'inline';
  return (
    <View
      accessibilityRole="radiogroup"
      style={[inline ? styles.segInline : styles.segFill, { backgroundColor: surface }]}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[inline ? styles.segItemInline : styles.segItemFill, on && { backgroundColor: colors.text }]}
          >
            <T
              mono={inline}
              weight={600}
              size={inline ? 12 : 14}
              style={{ color: on ? colors.bg : colors.muted }}
            >
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The comp's switch: coral when on. */
export function Switch({ on, dim }: { on: boolean; dim?: boolean }) {
  return (
    <View
      style={[
        styles.switch,
        { backgroundColor: on ? colors.live : colors.track, justifyContent: on ? 'flex-end' : 'flex-start' },
        dim && { opacity: 0.5 },
      ]}
    >
      <View style={[styles.knob, { backgroundColor: on ? colors.liveInk : colors.faint }]} />
    </View>
  );
}

/**
 * The comp's boxed field: the label sits inside the box above the value.
 * `secret` adds a Show / Hide toggle; `invalid` draws the coral edge.
 */
export const TextField = forwardRef<
  TextInput,
  TextInputProps & { label: string; secret?: boolean; invalid?: boolean }
>(function TextField({ label, secret, invalid, style, ...props }, ref) {
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.field,
        { borderColor: invalid ? colors.live : focused ? colors.border : 'transparent' },
      ]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <T weight={600} size={12} tone="muted">
          {label}
        </T>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.faint}
          selectionColor={colors.autodjText}
          cursorColor={colors.text}
          {...props}
          secureTextEntry={secret && !revealed}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[styles.input, style]}
        />
      </View>
      {secret && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          hitSlop={8}
          onPress={() => setRevealed((r) => !r)}
          style={{ padding: 8 }}
        >
          <T weight={600} size={13} tone="muted">
            {revealed ? 'Hide' : 'Show'}
          </T>
        </Pressable>
      )}
    </View>
  );
});

/** A row inside a card, split from the one above by a hairline. */
export function Divided({ first, children, style }: { first: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[!first && { borderTopWidth: 1, borderTopColor: colors.hairline }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 2,
    paddingTop: 4,
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  pill: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 13 },
  chip: { backgroundColor: colors.chip, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  state: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segInline: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 2 },
  segItemInline: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 9 },
  segFill: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  segItemFill: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  switch: { width: 40, height: 24, borderRadius: 12, padding: 3, flexDirection: 'row', alignItems: 'center' },
  knob: { width: 18, height: 18, borderRadius: 9 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  input: { ...font(500, 17), color: colors.text, padding: 0, margin: 0 },
});
