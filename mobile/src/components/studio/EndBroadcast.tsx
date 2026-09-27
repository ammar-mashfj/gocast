import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from '../../lib/api';
import { colors, fonts } from '../../lib/theme';
import { Overlay } from '../Overlay';
import { Button, T } from '../ui';

export type AfterEnd = 'autodj' | 'silence' | 'off_air';

/**
 * The web's EndBroadcast confirmation. What the dialog says happens next
 * depends on the plan and the rotation: without AutoDJ the station goes off
 * air; with AutoDJ but nothing to play it goes silent and switches off; with a
 * rotation, AutoDJ takes over. "End" itself is neutral; only the confirm is red.
 */
export function EndBroadcast({
  slug,
  autoDjLocked,
  onEnd,
}: {
  slug: string;
  autoDjLocked: boolean;
  onEnd: (after: AfterEnd) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [rotationEmpty, setRotationEmpty] = useState(false);

  const openDialog = () => {
    setOpen(true);
    if (autoDjLocked) return;
    api<{ data: { playlist_length?: number | null } }>(`/stations/${slug}/status`)
      .then(({ data }) => setRotationEmpty(data.playlist_length === 0))
      .catch(() => {});
  };

  const after: AfterEnd = autoDjLocked ? 'off_air' : rotationEmpty ? 'silence' : 'autodj';

  return (
    <>
      <Button label="End broadcast" variant="outline" onPress={openDialog} style={{ flex: 1 }} />
      <Overlay visible={open} onClose={() => setOpen(false)} dismissable={!ending}>
        <T style={styles.title}>End this broadcast?</T>
        <T tone="muted" size={14} style={{ lineHeight: 20 }}>
          Everyone tuned in right now is cut off{' '}
          {after === 'off_air'
            ? 'and the station goes off air.'
            : after === 'silence'
              ? 'and AutoDJ takes over with nothing to play, so the station goes silent and switches off in a few minutes.'
              : 'and AutoDJ takes over, so the station stays on air.'}
        </T>
        <View style={styles.actions}>
          <Button
            label="Keep going"
            variant="outline"
            disabled={ending}
            onPress={() => setOpen(false)}
            style={{ flex: 1 }}
          />
          <Button
            label={ending ? 'Ending…' : 'Yes, end it'}
            variant="destructive"
            busy={ending}
            onPress={async () => {
              setEnding(true);
              try {
                await onEnd(after);
              } finally {
                setEnding(false);
                setOpen(false);
              }
            }}
            style={{ flex: 1 }}
          />
        </View>
      </Overlay>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text, letterSpacing: -0.4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
