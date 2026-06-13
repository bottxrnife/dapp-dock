import { useRouter } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Gift, Receipt, Star } from 'lucide-react-native';
import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { BackButton, Screen, Txt } from '../src/components/ui';
import { ActivityEntry, useApp } from '../src/state/store';
import { C } from '../src/theme';

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function iconFor(kind: ActivityEntry['kind']) {
  const p = { size: 16, color: C.blueLink, strokeWidth: 2.2 as const };
  switch (kind) {
    case 'redeem':
      return <Gift {...p} />;
    case 'review':
      return <Star {...p} />;
    case 'send':
      return <ArrowUpRight {...p} />;
    case 'receive':
      return <ArrowDownLeft {...p} />;
    default:
      return <Receipt {...p} />;
  }
}

function labelFor(kind: ActivityEntry['kind']): string {
  switch (kind) {
    case 'redeem':
      return 'Reward redeemed';
    case 'review':
      return 'Review posted';
    case 'send':
      return 'Sent';
    case 'receive':
      return 'Received';
    default:
      return 'Purchase';
  }
}

export default function Activity() {
  const router = useRouter();
  const activity = useApp((s) => s.activity);
  useApp((s) => s.themeMode); // repaint on theme toggle

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <View style={{ flex: 1 }}>
          <Txt size={16} w={800}>
            Activity
          </Txt>
          <Txt size={12} w={600} color={C.text2}>
            Receipts from every dapp you run
          </Txt>
        </View>
      </View>

      {activity.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 90, paddingHorizontal: 20 }}>
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 19,
              backgroundColor: C.segBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Receipt size={22} color={C.text3} strokeWidth={2} />
          </View>
          <Txt size={16} w={700} style={{ marginTop: 16 }}>
            No activity yet
          </Txt>
          <Txt size={13.5} color={C.text2} center style={{ marginTop: 6 }}>
            Run a dapp — pay a bill, stamp a loyalty card, send money — and your receipts show up here.
          </Txt>
        </View>
      ) : (
        <View style={{ gap: 8, marginTop: 16 }}>
          {activity.map((a) => {
            const amountColor = a.points && a.points < 0 ? C.danger : C.success;
            const right = a.points
              ? `${a.points > 0 ? '+' : ''}${a.points.toLocaleString()} pts`
              : a.amountUsd
                ? `${a.kind === 'send' ? '−' : ''}$${a.amountUsd.toFixed(2)}`
                : '';
            const row = (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 13,
                  backgroundColor: C.surface,
                  borderRadius: 18,
                  padding: 15,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: C.blueSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {iconFor(a.kind)}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={14.5} w={700} numberOfLines={1}>
                    {a.title}
                  </Txt>
                  <Txt size={12} color={C.text3} style={{ marginTop: 1 }}>
                    {labelFor(a.kind)} · {timeAgo(a.ts)}
                    {a.live ? ' · onchain' : ''}
                  </Txt>
                  {a.note ? (
                    <Txt size={12} color={C.text2} numberOfLines={1} style={{ marginTop: 1 }}>
                      {a.note}
                    </Txt>
                  ) : null}
                </View>
                {right ? (
                  <Txt size={13.5} w={800} color={amountColor}>
                    {right}
                  </Txt>
                ) : null}
              </View>
            );
            return a.explorerUrl ? (
              <Pressable key={a.id} onPress={() => Linking.openURL(a.explorerUrl!)}>
                {row}
              </Pressable>
            ) : (
              <View key={a.id}>{row}</View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
