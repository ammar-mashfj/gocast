import { IconEye, IconEyeOff } from '@tabler/icons-react-native';
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
  type ViewStyle,
} from 'react-native';

import { alpha, colors, fonts, panelShadow, radius } from '../lib/theme';

/** Onest body text; pass `mono` for times, slugs and data (the Mono Means Machine rule). */
export function T({
  style,
  mono,
  tone = 'text',
  size = 14,
  weight = 'regular',
  ...props
}: TextProps & {
  mono?: boolean;
  tone?: 'text' | 'secondary' | 'muted' | 'faint' | 'live' | 'mic' | 'fault' | 'violet';
  size?: number;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
}) {
  const color = {
    text: colors.text,
    secondary: colors.textSecondary,
    muted: colors.muted,
    faint: colors.faint,
    live: colors.liveText,
    mic: colors.micText,
    fault: colors.faultText,
    violet: colors.violetText,
  }[tone];
  const fontFamily = mono
    ? weight === 'regular'
      ? fonts.mono
      : fonts.monoMedium
    : { regular: fonts.body, medium: fonts.medium, semibold: fonts.semibold, bold: fonts.bold }[weight];
  return (
    <Text
      {...props}
      style={[{ color, fontFamily, fontSize: size, fontVariant: mono ? ['tabular-nums'] : undefined }, style]}
    />
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.pageTitle}>{children}</Text>;
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'destructive' | 'mic';

export function Button({
  label,
  variant = 'outline',
  icon,
  busy,
  disabled,
  style,
  height = 44,
  ...props
}: Omit<PressableProps, 'style'> & {
  label?: string;
  variant?: ButtonVariant;
  icon?: ReactNode;
  busy?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      {...props}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { height, backgroundColor: v.bg, borderColor: v.border },
        pressed && { opacity: 0.8, transform: [{ translateY: 1 }] },
        (disabled || busy) && { opacity: 0.45 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={v.text} /> : icon}
      {!!label && <Text style={[styles.buttonText, { color: v.text }]}>{label}</Text>}
    </Pressable>
  );
}

const VARIANTS: Record<ButtonVariant, { bg: string; border: string; text: string }> = {
  primary: { bg: colors.violetFill, border: colors.violetFill, text: '#ffffff' },
  outline: { bg: alpha('#ffffff', 0.04), border: colors.inputLine, text: colors.text },
  ghost: { bg: 'transparent', border: 'transparent', text: colors.muted },
  destructive: { bg: alpha(colors.fault, 0.2), border: alpha(colors.fault, 0.4), text: colors.fault },
  mic: { bg: colors.mic, border: colors.mic, text: colors.micInk },
};

/** A pill that labels a state. Tinted, never solid. */
export function Pill({ label, tone }: { label: string; tone: 'live' | 'onAir' | 'off' | 'neutral' }) {
  const t = {
    live: { bg: alpha(colors.live, 0.1), border: alpha(colors.live, 0.25), text: colors.liveText },
    onAir: { bg: alpha(colors.violet, 0.1), border: alpha(colors.violet, 0.3), text: colors.violetText },
    off: { bg: 'transparent', border: alpha('#ffffff', 0.1), text: colors.faint },
    neutral: { bg: 'transparent', border: alpha('#ffffff', 0.15), text: colors.text },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.pillText, { color: t.text }]}>{label}</Text>
    </View>
  );
}

/** Two or three mutually exclusive options, like the web's radio groups. */
export function Segmented<T extends string | boolean>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: alpha('#ffffff', 0.12) }]}
          >
            <Text style={[styles.segmentText, { color: on ? colors.text : colors.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A labelled input. The label sits above the field, never only as a
 * placeholder, so it survives typing. `secret` adds a show/hide toggle.
 */
export const TextField = forwardRef<
  TextInput,
  TextInputProps & { label: string; secret?: boolean; trailing?: ReactNode }
>(function TextField({ label, secret, trailing, style, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {trailing}
      </View>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.faint}
          selectionColor={colors.violetPale}
          cursorColor={colors.violetPale}
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
          style={[styles.fieldInput, style]}
        />
        {secret && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={8}
            onPress={() => setRevealed((r) => !r)}
            style={styles.fieldToggle}
          >
            {revealed ? (
              <IconEyeOff size={20} color={colors.muted} />
            ) : (
              <IconEye size={20} color={colors.muted} />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
});

/** The dashboard's plan badge: tinted, never solid. Free is violet, Pro amber. */
export function PlanTag({ slug, name }: { slug: string; name: string }) {
  const pro = slug !== 'free';
  return (
    <View
      style={[
        styles.planTag,
        pro
          ? { backgroundColor: alpha(colors.pro, 0.1), borderColor: alpha(colors.pro, 0.3) }
          : { backgroundColor: alpha(colors.violet, 0.15), borderColor: alpha(colors.violet, 0.5) },
      ]}
    >
      <Text style={[styles.planTagText, { color: pro ? colors.proText : colors.violetText }]}>{name}</Text>
    </View>
  );
}

/**
 * A station's initials on a tile: lit violet while it is on air in any form,
 * unlit (3% white, faint text) while off air, as on the player page.
 */
export function InitialsTile({ name, lit, size = 56 }: { name: string; lit: boolean; size?: number }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size >= 48 ? radius.xl : radius.lg },
        lit
          ? { backgroundColor: alpha(colors.violet, 0.2), borderColor: alpha(colors.violet, 0.5) }
          : { backgroundColor: colors.unlit, borderColor: colors.unlitEdge },
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.display,
          fontSize: size * 0.36,
          letterSpacing: -0.5,
          color: lit ? colors.violetPale : colors.faint,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pageTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.6 },
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.hairline,
    borderWidth: 1,
    borderRadius: radius.xxl,
    ...panelShadow,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  buttonText: { fontFamily: fonts.semibold, fontSize: 15 },
  pill: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  pillText: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.3 },
  segmented: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: alpha('#ffffff', 0.02),
  },
  segment: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: fonts.medium, fontSize: 13 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: colors.panel,
    borderColor: colors.inputLine,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  fieldFocused: { borderColor: colors.violetPale },
  fieldInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  fieldToggle: { height: '100%', paddingHorizontal: 14, justifyContent: 'center' },
  planTag: { borderWidth: 1, borderRadius: radius.full, paddingLeft: 9, paddingRight: 7, paddingVertical: 2 },
  planTagText: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  tile: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
