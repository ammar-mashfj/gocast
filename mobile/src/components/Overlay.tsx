import { createContext, Fragment, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '../lib/theme';

/**
 * Sheets and dialogs drawn inside the app's own view tree.
 *
 * React Native's <Modal> opens a separate Android window. Next to the gesture
 * handler the running order needs, a closed one could stay on screen,
 * invisible, and swallow every touch — the studio looked frozen after the
 * mic settings sheet. An overlay layer above the navigator has no second
 * window to leave behind.
 */

interface PortalApi {
  mount: (id: string, node: ReactNode) => void;
  unmount: (id: string) => void;
}

const PortalContext = createContext<PortalApi | null>(null);

export function OverlayHost({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<Record<string, ReactNode>>({});
  const api = useMemo<PortalApi>(
    () => ({
      mount: (id, node) => setNodes((prev) => ({ ...prev, [id]: node })),
      unmount: (id) =>
        setNodes((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        }),
    }),
    [],
  );
  return (
    <PortalContext.Provider value={api}>
      {/* `children` keeps its identity across host renders, so mounting an
          overlay does not re-render the screens underneath. */}
      {children}
      <View pointerEvents="box-none" style={styles.layer}>
        {Object.entries(nodes).map(([id, node]) => (
          <Fragment key={id}>{node}</Fragment>
        ))}
      </View>
    </PortalContext.Provider>
  );
}

function Portal({ children }: { children: ReactNode }) {
  const id = useId();
  const portal = useContext(PortalContext);
  useEffect(() => {
    portal?.mount(id, children);
  }, [portal, id, children]);
  useEffect(() => () => portal?.unmount(id), [portal, id]);
  return null;
}

/**
 * A dimmed layer with a bottom sheet or a centred dialog. Back and a tap on
 * the scrim close it unless `dismissable` is false (a dialog mid-action).
 */
export function Overlay({
  visible,
  onClose,
  placement = 'center',
  dismissable = true,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  placement?: 'center' | 'bottom';
  dismissable?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dismissable) onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, dismissable, onClose]);

  if (!visible) return null;
  return (
    <Portal>
      <FadeIn>
        <Pressable accessibilityLabel="Close" style={styles.scrim} onPress={() => dismissable && onClose()} />
        <View pointerEvents="box-none" style={placement === 'bottom' ? styles.bottom : styles.center}>
          <View style={placement === 'bottom' ? styles.sheet : styles.dialog}>{children}</View>
        </View>
      </FadeIn>
    </Portal>
  );
}

function FadeIn({ children }: { children: ReactNode }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.8)' },
  center: { ...StyleSheet.absoluteFill, justifyContent: 'center', padding: 16 },
  bottom: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  dialog: {
    backgroundColor: colors.popover,
    borderColor: colors.hairline,
    borderWidth: 1,
    borderRadius: radius.xxl,
    padding: 20,
    gap: 12,
  },
  sheet: {
    backgroundColor: colors.popover,
    borderColor: colors.hairline,
    borderWidth: 1,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: 20,
    paddingBottom: 36,
    gap: 18,
  },
});
