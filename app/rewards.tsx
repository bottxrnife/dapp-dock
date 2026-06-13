import { useRouter } from 'expo-router';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { BackButton, Chip, CountUp, DappAvatar, Screen, SectionHeader, Txt } from '../src/components/ui';
import { POINTS_REWARDS, PointsReward } from '../src/data/seeds';
import { activePasses, tierFor, totalPoints } from '../src/services/loyalty';
import { useApp } from '../src/state/store';
import { C } from '../src/theme';

export default function Rewards() {
  const router = useRouter();
  const loyalty = useApp((s) => s.loyalty);
  const loyaltyOnchain = useApp((s) => s.loyaltyOnchain);
  const listings = useApp((s) => s.listings);
  const activity = useApp((s) => s.activity);
  const spendPoints = useApp((s) => s.spendPoints);
  useApp((s) => s.themeMode); // repaint on theme toggle

  const passes = activePasses(loyalty);
  const total = totalPoints(loyalty);
  const { tier, next, toNext, progress } = tierFor(total);

  const listingFor = (ens: string) => listings.find((l) => l.manifest.ensName === ens);
  const nameFor = (ens: string) => listingFor(ens)?.manifest.name ?? ens;
  const monoFor = (ens: string) =>
    listingFor(ens)?.monogram ?? ens.slice(0, 2).toUpperCase();

  const redeem = (r: PointsReward) => {
    const have = loyalty[r.ens]?.points ?? 0;
    if (have < r.cost) {
      Alert.alert('Not enough points', `You need ${r.cost.toLocaleString()} points for ${r.label}. You have ${have.toLocaleString()}.`);
      return;
    }
    Alert.alert('Redeem reward', `Spend ${r.cost.toLocaleString()} points on ${r.label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Redeem',
        onPress: () => {
          const ok = spendPoints(r.ens, r.cost, r.label);
          if (ok) Alert.alert('Redeemed 🎉', `${r.label} is ready — show this at the counter.`);
        },
      },
    ]);
  };

  const recent = activity.slice(0, 4);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <View style={{ flex: 1 }}>
          <Txt size={16} w={800}>
            Rewards
          </Txt>
          <Txt size={12} w={600} color={C.text2}>
            Your loyalty across every dapp
          </Txt>
        </View>
      </View>

      {/* tier + total points */}
      <View style={{ backgroundColor: C.inkPanel, borderRadius: 24, padding: 20, marginTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Txt size={11} w={700} color="#B8C6F2" ls={0.06} style={{ textTransform: 'uppercase' }}>
              Total points
            </Txt>
            <CountUp
              value={total}
              format={(n) => Math.round(n).toLocaleString()}
              size={30}
              w={800}
              color={C.white}
              style={{ marginTop: 3 }}
            />
          </View>
          <View
            style={{
              backgroundColor: tier.accent,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Sparkles size={13} color={C.white} strokeWidth={2.4} />
            <Txt size={13} w={800} color={C.white}>
              {tier.name}
            </Txt>
          </View>
        </View>
        {/* progress to next tier */}
        <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.14)', marginTop: 16, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: 8, backgroundColor: C.accent }} />
        </View>
        <Txt size={12} color="#B8C6F2" style={{ marginTop: 8 }}>
          {next ? `${toNext.toLocaleString()} points to ${next.name}` : 'Top tier reached 🎉'}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: loyaltyOnchain ? C.successStrong : '#8C9BCB',
            }}
          />
          <Txt size={11} w={600} color="#8C9BCB">
            {loyaltyOnchain ? 'Synced from your ENS profile' : 'Saved on device · set a dappdock.loyalty ENS record to sync'}
          </Txt>
        </View>
      </View>

      {/* active passes */}
      <SectionHeader title="Your cards" />
      {passes.length === 0 ? (
        <View style={{ backgroundColor: C.surface, borderRadius: 20, padding: 18 }}>
          <Txt size={13.5} color={C.text2} lh={1.5}>
            No loyalty cards yet. Pay at a participating dapp — like Burger Block Rewards — to start stamping and earning points.
          </Txt>
          <Chip
            label="Browse rewards dapps"
            bg={C.blueSoft}
            color={C.blueLink}
            size={12.5}
            px={13}
            py={8}
            onPress={() => router.push('/store')}
          />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {passes.map(({ ens, record }) => {
            const l = listingFor(ens);
            const punch = l?.manifest.components.find((c) => c.type === 'punchCard') as
              | { total: number; reward: string }
              | undefined;
            return (
              <Pressable
                key={ens}
                onPress={() => router.push(`/runtime/${ens}`)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 13,
                  backgroundColor: C.surface,
                  borderRadius: 20,
                  padding: 16,
                }}
              >
                <DappAvatar ens={ens} category={listingFor(ens)?.manifest.category} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={15} w={700} numberOfLines={1}>
                    {nameFor(ens)}
                  </Txt>
                  <Txt size={12.5} color={C.text2} style={{ marginTop: 2 }}>
                    {punch ? `${Math.min(record.punches, punch.total)}/${punch.total} stamps · ` : ''}
                    {record.points.toLocaleString()} pts
                    {record.redeemed > 0 ? ` · ${record.redeemed} redeemed` : ''}
                  </Txt>
                </View>
                {punch && record.punches >= punch.total ? (
                  <Chip label="Reward ready" bg={C.successBg} color={C.success} size={11} py={5} />
                ) : (
                  <ChevronRight size={18} color={C.text3} strokeWidth={2.2} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* points marketplace */}
      <SectionHeader title="Spend your points" />
      <View style={{ gap: 8 }}>
        {POINTS_REWARDS.map((r) => {
          const have = loyalty[r.ens]?.points ?? 0;
          const affordable = have >= r.cost;
          return (
            <View
              key={`${r.ens}-${r.label}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                backgroundColor: C.surface,
                borderRadius: 20,
                padding: 16,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: C.blueSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Txt size={20}>{r.emoji}</Txt>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={14.5} w={700} numberOfLines={1}>
                  {r.label}
                </Txt>
                <Txt size={12.5} color={C.text2} style={{ marginTop: 2 }}>
                  {nameFor(r.ens)} · {r.cost.toLocaleString()} pts
                </Txt>
              </View>
              <Pressable
                onPress={() => redeem(r)}
                style={{
                  backgroundColor: affordable ? C.cta : C.dividerSoft,
                  borderRadius: 999,
                  paddingHorizontal: 15,
                  paddingVertical: 9,
                }}
              >
                <Txt size={12.5} w={700} color={affordable ? C.ctaText : C.text3}>
                  Redeem
                </Txt>
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* recent activity */}
      {recent.length > 0 && (
        <>
          <SectionHeader title="Recent activity" link="See all" onLink={() => router.push('/activity')} />
          <View style={{ gap: 8 }}>
            {recent.map((a) => (
              <View
                key={a.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: C.surface,
                  borderRadius: 18,
                  paddingVertical: 13,
                  paddingHorizontal: 16,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={13.5} w={600} numberOfLines={1}>
                    {a.title}
                  </Txt>
                  <Txt size={11.5} color={C.text3} style={{ marginTop: 1 }}>
                    {a.kind === 'redeem' ? 'Reward redeemed' : a.kind === 'purchase' ? 'Purchase' : a.kind}
                  </Txt>
                </View>
                <Txt size={12.5} w={700} color={a.points && a.points < 0 ? C.danger : C.success}>
                  {a.points ? `${a.points > 0 ? '+' : ''}${a.points.toLocaleString()} pts` : a.amountUsd ? `$${a.amountUsd.toFixed(2)}` : ''}
                </Txt>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
