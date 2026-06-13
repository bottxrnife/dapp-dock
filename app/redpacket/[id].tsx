import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Copy, Gift } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { QR } from '../../src/components/QR';
import { BackButton, Chip, CountUp, PrimaryButton, Screen, SuccessCheck, Txt } from '../../src/components/ui';
import { notifyReceived } from '../../src/services/notify';
import { verifyHuman } from '../../src/services/verification';
import { useApp } from '../../src/state/store';
import { C } from '../../src/theme';

export default function RedPacketView() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const packet = useApp((s) => s.redPackets[id ?? '']);
  const claimRedPacket = useApp((s) => s.claimRedPacket);
  const recordActivity = useApp((s) => s.recordActivity);
  useApp((s) => s.themeMode); // repaint on theme toggle

  const [claiming, setClaiming] = useState(false);
  const [won, setWon] = useState<number | null>(null);

  // not-found state
  if (!packet) {
    return (
      <Screen scroll={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => router.replace('/home')} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <Gift size={40} color={C.text3} strokeWidth={1.8} />
          <Txt size={20} w={800} style={{ marginTop: 16 }}>
            Packet not found
          </Txt>
          <Txt size={14} color={C.text2} center lh={1.5} style={{ marginTop: 8, maxWidth: 280 }}>
            This red packet may have expired or the link is mistyped.
          </Txt>
          <PrimaryButton label="Back to home" onPress={() => router.replace('/home')} style={{ marginTop: 22, alignSelf: 'stretch' }} />
        </View>
      </Screen>
    );
  }

  const opened = packet.claims.length;
  const remaining = packet.count - opened;
  const claimedUsd = packet.claims.reduce((sum, c) => sum + c.amountUsd, 0);
  const remainingUsd = Math.max(0, packet.totalUsd - claimedUsd);
  const link = `dappdock://redpacket/${packet.id}`;

  const copyLink = async () => {
    await Clipboard.setStringAsync(link);
    Alert.alert('Copied', 'Red packet link copied to clipboard.');
  };

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const v = await verifyHuman({ signal: `redpacket:${packet.id}` });
      if (!v.verified) {
        Alert.alert('World ID required', v.error ?? 'Verify you are a unique human to open a packet.');
        return;
      }
      const r = claimRedPacket(packet.id, v.nullifierHash ?? '0xsimulated');
      if (!r.ok) {
        if (r.reason === 'already') {
          Alert.alert('Already opened', 'You already opened this packet — one per human.');
        } else if (r.reason === 'empty') {
          Alert.alert('All gone', 'All packets have been claimed.');
        } else {
          Alert.alert('Could not open', 'This packet is no longer available.');
        }
        return;
      }
      recordActivity({
        ens: 'redpacket',
        title: `Opened a red packet from ${packet.from}`,
        kind: 'receive',
        amountUsd: r.amountUsd,
        live: false,
      });
      notifyReceived(r.amountUsd, packet.from);
      setWon(r.amountUsd);
    } finally {
      setClaiming(false);
    }
  };

  // celebratory reveal
  if (won != null) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => router.replace('/home')} />
          <View style={{ flex: 1 }}>
            <Txt size={16} w={800}>
              Lucky Money
            </Txt>
            <Txt size={12} w={600} color={C.text2}>
              from {packet.from}
            </Txt>
          </View>
        </View>

        <View style={{ backgroundColor: C.inkPanel, borderRadius: 26, padding: 28, marginTop: 16, alignItems: 'center' }}>
          <SuccessCheck size={64} bg="rgba(255,255,255,0.12)" color={C.white} glyph="🎉" />
          <Txt size={14} color="#B8C6F2" style={{ marginTop: 18 }}>
            You got
          </Txt>
          <CountUp
            value={won}
            prefix="$"
            format={(n) => n.toFixed(2)}
            size={42}
            w={800}
            color={C.white}
            style={{ marginTop: 4 }}
          />
          <Txt size={12.5} color="#B8C6F2" center lh={1.5} style={{ marginTop: 10, maxWidth: 260 }}>
            Your share is recorded to your activity. It settles to your wallet via LI.FI once the sender funds the pool.
          </Txt>
        </View>

        <PrimaryButton label="Done" onPress={() => router.replace('/home')} style={{ marginTop: 18 }} />
        <Txt size={11.5} color={C.text3} center style={{ marginTop: 10 }}>
          Verified as a unique human with World ID.
        </Txt>
      </Screen>
    );
  }

  const allOpened = remaining <= 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <View style={{ flex: 1 }}>
          <Txt size={16} w={800}>
            Lucky Money
          </Txt>
          <Txt size={12} w={600} color={C.text2}>
            from {packet.from}
          </Txt>
        </View>
      </View>

      {/* packet summary (inkPanel) */}
      <View style={{ backgroundColor: C.inkPanel, borderRadius: 26, padding: 24, marginTop: 16, alignItems: 'center' }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: 'rgba(255,255,255,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Gift size={30} color={C.white} strokeWidth={2.4} />
        </View>
        <Txt size={32} w={800} color={C.white} style={{ marginTop: 16 }}>
          ${packet.totalUsd.toFixed(2)}
        </Txt>
        <Txt size={13} color="#B8C6F2" style={{ marginTop: 3 }}>
          🧧 {opened}/{packet.count} opened · ${remainingUsd.toFixed(2)} left
        </Txt>
        <View style={{ height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.14)', marginTop: 16, overflow: 'hidden', alignSelf: 'stretch' }}>
          <View style={{ width: `${Math.round((opened / Math.max(1, packet.count)) * 100)}%`, height: 7, backgroundColor: C.accent }} />
        </View>
      </View>

      {/* claim CTA */}
      {!allOpened ? (
        <PrimaryButton
          testID="redpacket-open"
          label={claiming ? 'Verifying you’re human…' : 'Open your packet 🧧'}
          onPress={claim}
          leading={<Gift size={17} color={C.ctaText} strokeWidth={2.4} />}
          style={{ marginTop: 16 }}
        />
      ) : (
        <View style={{ backgroundColor: C.surface, borderRadius: 18, padding: 18, marginTop: 16, alignItems: 'center' }}>
          <Txt size={15} w={700}>
            All opened 🎉
          </Txt>
          <Txt size={12.5} color={C.text2} center lh={1.45} style={{ marginTop: 6, maxWidth: 260 }}>
            Every packet in this batch has been claimed by a verified human.
          </Txt>
        </View>
      )}

      {/* share QR — most prominent when shares remain */}
      <View style={{ backgroundColor: C.surface, borderRadius: 22, padding: 18, marginTop: 14, alignItems: 'center' }}>
        <Txt size={13} w={700} color={C.text2}>
          {allOpened ? 'Share this packet' : 'Share to let others open one'}
        </Txt>
        <View style={{ marginTop: 12 }}>
          <QR value={link} size={allOpened ? 140 : 184} />
        </View>
        <Pressable testID="redpacket-copy" onPress={copyLink} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <Txt size={12.5} w={600} color={C.blueLink}>
            Copy link
          </Txt>
          <Copy size={15} color={C.text2} strokeWidth={2} />
        </Pressable>
      </View>

      {/* claims ledger */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 4 }}>
        <Txt size={13} w={700} color={C.text2}>
          Opened
        </Txt>
        <Txt size={13} w={700}>
          ${claimedUsd.toFixed(2)} of ${packet.totalUsd.toFixed(2)}
        </Txt>
      </View>
      {packet.claims.length > 0 ? (
        <View style={{ gap: 8, marginTop: 10 }}>
          {packet.claims.map((c) => (
            <View
              key={`${c.nullifier}-${c.ts}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: C.surface,
                borderRadius: 16,
                paddingVertical: 12,
                paddingHorizontal: 16,
              }}
            >
              <Chip label="✓ Verified human" bg={C.successBg} color={C.success} size={10.5} px={9} py={4} />
              <Txt size={13.5} w={800} color={C.success}>
                +${c.amountUsd.toFixed(2)}
              </Txt>
            </View>
          ))}
        </View>
      ) : (
        <Txt size={12.5} color={C.text3} style={{ marginTop: 10, paddingHorizontal: 4 }}>
          No one has opened a packet yet — be the first.
        </Txt>
      )}
    </Screen>
  );
}
