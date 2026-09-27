import { IconExternalLink, IconHelpCircle, IconLayoutDashboard } from '@tabler/icons-react-native';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBroadcast } from '../broadcast/BroadcastContext';
import { Overlay } from '../components/Overlay';
import { Button, InitialsTile, Panel, PlanTag, T } from '../components/ui';
import { mediaUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import { openWeb } from '../lib/web';

/** Who is signed in, what their plan allows, and the way out. */
export default function Account() {
  const { state, signOut } = useAuth();
  const broadcast = useBroadcast();
  const insets = useSafeAreaInsets();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (state.status !== 'signedIn') return null;
  const { user } = state;
  const plan = user.plan;
  const pro = !!plan && plan.slug !== 'free';
  const onAir = broadcast.state === 'live' || broadcast.state === 'reconnecting';

  const doSignOut = async () => {
    setBusy(true);
    try {
      if (onAir) await broadcast.stop();
      await signOut();
      router.replace('/login');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.identity}>
        {user.avatar_url ? (
          <Image source={mediaUrl(user.avatar_url)} style={styles.avatar} contentFit="cover" />
        ) : (
          <InitialsTile name={user.name} lit size={64} />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <T size={18} weight="semibold" numberOfLines={1}>
            {user.name}
          </T>
          <T tone="muted" size={14} numberOfLines={1}>
            {user.email}
          </T>
        </View>
      </View>

      {plan && (
        <Panel style={styles.panel}>
          <View style={styles.planHead}>
            <T size={16} weight="semibold">
              Your plan
            </T>
            <PlanTag slug={plan.slug} name={plan.name} />
          </View>
          <Fact label="Listeners at once" value={plan.max_listeners > 0 ? `Up to ${plan.max_listeners}` : '—'} />
          <Fact
            label="AutoDJ"
            value={plan.autodj_enabled ? 'Plays your library when nobody is live' : 'Not on this plan'}
          />
          {plan.expires_at && <Fact label="Ends" value={formatDate(plan.expires_at)} />}
          {!pro && (
            <T tone="muted" size={13} style={{ lineHeight: 19 }}>
              Pro adds AutoDJ, a weekly schedule and up to 1,000 listeners. Request it from the web dashboard.
            </T>
          )}
        </Panel>
      )}

      <Panel style={styles.links}>
        <LinkRow
          icon={<IconLayoutDashboard size={20} color={colors.muted} />}
          label="Open the web dashboard"
          onPress={() => openWeb('/dashboard')}
        />
        <View style={styles.divider} />
        <LinkRow
          icon={<IconHelpCircle size={20} color={colors.muted} />}
          label="Help"
          onPress={() => openWeb('/help')}
        />
      </Panel>

      <Button label="Sign out" busy={busy} onPress={() => (onAir ? setConfirming(true) : doSignOut())} />

      <T mono tone="faint" size={11} style={{ textAlign: 'center' }}>
        GoCast {Constants.expoConfig?.version ?? ''}
      </T>

      <Overlay visible={confirming} onClose={() => setConfirming(false)} dismissable={!busy}>
        <T size={17} weight="semibold">
          End the broadcast and sign out?
        </T>
        <T tone="muted" size={14} style={{ lineHeight: 21 }}>
          You&apos;re live on {broadcast.stationName}. Signing out ends the show for your listeners.
        </T>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Button label="Stay live" onPress={() => setConfirming(false)} style={{ flex: 1 }} />
          <Button label="End and sign out" variant="destructive" busy={busy} onPress={doSignOut} style={{ flex: 1 }} />
        </View>
      </Overlay>
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <T tone="muted" size={13}>
        {label}
      </T>
      <T size={14} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </T>
    </View>
  );
}

function LinkRow({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.mutedSurface }]}
    >
      {icon}
      <T size={15} style={{ flex: 1 }}>
        {label}
      </T>
      <IconExternalLink size={16} color={colors.faint} />
    </Pressable>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  avatar: { width: 64, height: 64, borderRadius: 14, backgroundColor: colors.unlit },
  panel: { padding: 16, gap: 12 },
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  links: { overflow: 'hidden' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 52 },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: 48 },
});
