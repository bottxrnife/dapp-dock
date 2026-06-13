import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Pressable, TextInput, View } from 'react-native';
import { MenuOrder, MenuItem } from '../../src/components/MenuOrder';
import { PunchCard } from '../../src/components/PunchCard';
import { RestaurantApp } from '../../src/components/RestaurantApp';
import { BackButton, Chip, PrimaryButton, Pulse, Screen, SuccessCheck, Txt } from '../../src/components/ui';
import { authenticateForSpend } from '../../src/services/biometric';
import { ExecutionResult, runFlow } from '../../src/services/execution';
import { scheduleRewardReady } from '../../src/services/notify';
import { verifyHuman } from '../../src/services/verification';
import { findListing, hasListing, useApp } from '../../src/state/store';
import { DappManifest } from '../../src/types';
import { C } from '../../src/theme';

type RunState = 'form' | 'processing' | 'done';

function FormRow({
  label,
  value,
  valueColor = C.text,
  bold = 700,
  last,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: 600 | 700 | 800;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.dividerSoft,
      }}
    >
      <Txt size={13.5} color={C.text2}>
        {label}
      </Txt>
      <Txt size={bold === 800 ? 15 : 14.5} w={bold} color={valueColor}>
        {value}
      </Txt>
    </View>
  );
}

/** Editable form row: label on the left, an inline text field on the right. */
function EditableRow({
  label,
  value,
  onChange,
  prefix,
  keyboardType = 'default',
  last,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  prefix?: string;
  keyboardType?: 'default' | 'decimal-pad';
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.dividerSoft,
      }}
    >
      <Txt size={13.5} color={C.text2}>
        {label}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '62%' }}>
        {prefix ? (
          <Txt size={14.5} w={700} color={C.text2}>
            {prefix}
          </Txt>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          placeholderTextColor={C.text3}
          style={{
            minWidth: 80,
            textAlign: 'right',
            fontSize: 14.5,
            fontFamily: 'Geist_700Bold',
            color: C.text,
            paddingVertical: 6,
          }}
        />
      </View>
    </View>
  );
}

export default function Runtime() {
  const router = useRouter();
  const { ens } = useLocalSearchParams<{ ens: string }>();
  const draft = useApp((s) => s.draft);
  const verified = useApp((s) => s.verified);
  const setVerified = useApp((s) => s.setVerified);
  useApp((s) => s.themeMode); // repaint on theme toggle

  const listing = findListing(ens === 'draft' ? undefined : ens);
  const manifest: DappManifest = ens === 'draft' && draft ? draft : listing.manifest;

  // Entering Runtime always resets to the form state (spec rule).
  const [runState, setRunState] = useState<RunState>('form');
  const [runStep, setRunStep] = useState(0);
  const [paying, setPaying] = useState(false);
  const [mode, setMode] = useState<'purchase' | 'redeem'>('purchase');
  const [result, setResult] = useState<ExecutionResult | null>(null);

  const loyalty = useApp((s) => s.loyalty);
  const loyaltyOnchain = useApp((s) => s.loyaltyOnchain);
  const addStamp = useApp((s) => s.addStamp);
  const redeemReward = useApp((s) => s.redeemReward);
  const recordActivity = useApp((s) => s.recordActivity);

  const amount = manifest.components.find((c) => c.type === 'amountInput') as
    | { type: 'amountInput'; token: string; default: string; locked?: boolean }
    | undefined;
  const source = manifest.components.find((c) => c.type === 'sourceChain') as
    | { type: 'sourceChain'; value: string }
    | undefined;
  const recipient = manifest.components.find((c) => c.type === 'recipient') as
    | { type: 'recipient'; value: string }
    | undefined;
  const memo = manifest.components.find((c) => c.type === 'memoInput') as
    | { type: 'memoInput'; default: string }
    | undefined;
  const submit = manifest.components.find((c) => c.type === 'submitButton') as
    | { type: 'submitButton'; label: string }
    | undefined;
  const punch = manifest.components.find((c) => c.type === 'punchCard') as
    | { type: 'punchCard'; total: number; reward: string; pointsPerDollar: number }
    | undefined;
  const menu = manifest.components.find((c) => c.type === 'menu') as
    | { type: 'menu'; currency: string; items: MenuItem[] }
    | undefined;

  // Editable inputs: a non-locked amount and the memo can be changed before paying.
  const editableAmount = !!amount && !amount.locked;
  const [amountText, setAmountText] = useState(amount?.default ?? '');
  const [memoText, setMemoText] = useState(memo?.default ?? '');
  const enteredAmount = amount ? parseFloat(amountText || amount.default || '0') || 0 : 0;

  // Restaurant ordering: cart lives here so the order feeds the LI.FI total.
  const isOrder = !!menu;
  const [cart, setCart] = useState<Record<string, number>>({});
  const addItem = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const removeItem = (id: string) =>
    setCart((c) => {
      const n = (c[id] ?? 0) - 1;
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = menu
    ? menu.items.reduce((sum, it) => sum + it.priceUsd * (cart[it.id] ?? 0), 0)
    : 0;
  const payAmount = isOrder ? cartTotal : enteredAmount;

  const record = loyalty[manifest.ensName] ?? { punches: 0, points: 0, redeemed: 0 };
  const cardFull = !!punch && record.punches >= punch.total;

  // Loyalty redemption is local to the pass: verify stamps, issue the voucher, reset.
  const redeemSteps = punch
    ? [
        { id: 'verify', label: 'Verify your stamps', detail: `${punch.total} of ${punch.total} confirmed on your pass` },
        { id: 'voucher', label: 'Issue your reward voucher', detail: `Free ${punch.reward}` },
        { id: 'reset', label: 'Reset your punch card', detail: 'Your points balance stays untouched' },
        { id: 'save', label: 'Save your receipt', detail: 'Stored in your activity' },
      ]
    : [];

  const orderSummary = () =>
    menu
      ? menu.items
          .filter((it) => cart[it.id])
          .map((it) => `${cart[it.id]}× ${it.name}`)
          .join(', ')
      : undefined;

  const pay = async () => {
    if (paying) return;
    if (isOrder && cartCount === 0) {
      Alert.alert('Your cart is empty', 'Add a few items to your order first.');
      return;
    }
    setPaying(true);
    setMode('purchase');
    try {
      if (manifest.permissions.requiresWorldId && !verified) {
        const verification = await verifyHuman({ signal: manifest.ensName });
        if (!verification.verified) {
          Alert.alert('World ID required', verification.error ?? 'This dapp requires proof of humanity.');
          return;
        }
        setVerified({ verified: true, simulated: verification.simulated });
      }
      // Biometric confirmation for any spend (passes through on web / no hardware).
      const spendUsd = payAmount;
      if (spendUsd > 0) {
        const ok = await authenticateForSpend(`Confirm $${spendUsd.toFixed(2)} payment`);
        if (!ok) {
          Alert.alert('Cancelled', 'Payment was not confirmed.');
          return;
        }
      }
      setRunState('processing');
      setRunStep(0);
      const outcome = await runFlow(manifest, setRunStep, {
        amountUsd: isOrder ? cartTotal : amount ? enteredAmount : undefined,
      });
      const paidUsd = payAmount;
      // Carry the (possibly edited) memo onto the receipt for plain payments;
      // orders summarize their line items instead.
      const note = isOrder ? orderSummary() : memo ? memoText.trim() || memo.default : undefined;
      if (punch) {
        const earned = Math.round(paidUsd * punch.pointsPerDollar);
        addStamp(manifest.ensName, earned);
        recordActivity({
          ens: manifest.ensName,
          title: manifest.name,
          kind: 'purchase',
          amountUsd: paidUsd || undefined,
          points: earned,
          note,
          live: outcome.live,
          explorerUrl: outcome.explorerUrl,
        });
        if (record.punches + 1 >= punch.total) {
          scheduleRewardReady(manifest.name, punch.reward);
        }
      } else {
        recordActivity({
          ens: manifest.ensName,
          title: manifest.name,
          kind: 'purchase',
          amountUsd: paidUsd || undefined,
          note,
          live: outcome.live,
          explorerUrl: outcome.explorerUrl,
        });
      }
      setResult(outcome);
      setRunState('done');
    } catch (e) {
      setRunState('form');
      Alert.alert('Flow failed', String(e).slice(0, 300));
    } finally {
      setPaying(false);
    }
  };

  const redeem = async () => {
    if (paying || !punch) return;
    setMode('redeem');
    setResult(null);
    setRunState('processing');
    setRunStep(0);
    for (let i = 1; i <= redeemSteps.length; i++) {
      await new Promise((r) => setTimeout(r, 600));
      setRunStep(i);
    }
    redeemReward(manifest.ensName, punch.total);
    recordActivity({ ens: manifest.ensName, title: `Free ${punch.reward}`, kind: 'redeem' });
    await new Promise((r) => setTimeout(r, 500));
    setRunState('done');
  };

  const doneCopy =
    mode === 'redeem' && punch
      ? `Free ${punch.reward} redeemed — show this screen at the counter. Your card is back to ${Math.min(record.punches, punch.total)} of ${punch.total} stamps.`
      : isOrder && punch
        ? `Order in — you paid $${payAmount.toFixed(2)}, the kitchen is on it, and you collected a stamp (${Math.min(record.punches, punch.total)} of ${punch.total}).`
        : isOrder
          ? `Your order is in — you paid $${payAmount.toFixed(2)}. The kitchen is preparing it now.`
          : punch
            ? `You paid $${payAmount.toFixed(2)} and collected a stamp — ${Math.min(record.punches, punch.total)} of ${punch.total} on your card.`
            : manifest.outcome
                .replace(/^You will pay /, 'You paid ')
                .replace(/^You will /, 'You ')
                .replace(' and join ', ' and joined ')
                .replace(' and be ', ' and were ');

  const timelineSteps = mode === 'redeem' ? redeemSteps : manifest.workflow.steps;

  // A stale /runtime/draft with no draft in the store → back to the assistant
  // (mirrors preview/publish) rather than silently running the first seed dapp.
  if (ens === 'draft' && !draft) {
    return <Redirect href="/assistant" />;
  }

  // Unknown ENS (e.g. a stale deep link) → not-found rather than the wrong dapp.
  if (ens && ens !== 'draft' && !hasListing(ens)) {
    return (
      <Screen scroll={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/store'))} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <Txt size={20} w={800}>
            Dapp not found
          </Txt>
          <Txt size={14} color={C.text2} center lh={1.5} style={{ marginTop: 8, maxWidth: 280 }}>
            “{ens}” isn’t in the store yet. The link may be mistyped or the dapp unpublished.
          </Txt>
        </View>
      </Screen>
    );
  }

  // Menu dapps (restaurants) render the full tabbed ordering mini-app
  // (Order / Rewards / History + pickup QR) instead of the generic flow.
  // Use an independent guard so `menu` keeps its type for the legacy branch below.
  if (manifest.components.some((c) => c.type === 'menu')) {
    return <RestaurantApp manifest={manifest} listing={listing} />;
  }

  return (
    <Screen
      scroll={runState !== 'form' || isOrder}
      style={runState === 'form' && !isOrder ? { flex: 1 } : undefined}
    >
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/store'))} />
        <View style={{ flex: 1 }}>
          <Txt size={16} w={800}>
            {ens === 'draft' ? manifest.name : listing.runtimeTitle}
          </Txt>
          <Txt size={12} w={600} color={C.blueLink}>
            {manifest.ensName}
          </Txt>
        </View>
        <Chip
          label="✦ Ask assistant"
          bg={C.blueSoft}
          color={C.blueLink}
          size={11.5}
          px={12}
          py={7}
          onPress={() => router.push('/assistant')}
        />
      </View>

      {runState === 'form' && isOrder && menu && (
        <View style={{ marginTop: 16 }}>
          {punch && (
            <View style={{ marginBottom: 14 }}>
              <PunchCard brand={manifest.name} ens={manifest.ensName} category={manifest.category} total={punch.total} reward={punch.reward} record={record} onchain={loyaltyOnchain} />
            </View>
          )}
          <MenuOrder items={menu.items} cart={cart} onAdd={addItem} onRemove={removeItem} />

          {/* order summary + destination */}
          <View
            style={{
              backgroundColor: C.surface,
              borderRadius: 22,
              paddingVertical: 6,
              paddingHorizontal: 18,
              marginTop: 14,
            }}
          >
            <FormRow label="Items" value={cartCount === 0 ? 'None yet' : `${cartCount} in cart`} bold={600} />
            {source && <FormRow label="Pay from" value={source.value === 'any' ? 'Any chain' : source.value} />}
            {recipient && <FormRow label="Goes to" value={recipient.value} valueColor={C.blueLink} />}
            <FormRow label="Order total" value={`$${cartTotal.toFixed(2)} ${menu.currency}`} bold={800} last />
          </View>

          <View
            style={{
              backgroundColor: C.blueSoft,
              borderRadius: 18,
              paddingVertical: 15,
              paddingHorizontal: 18,
              marginTop: 10,
            }}
          >
            <Txt size={13.5} color={C.blueBody} lh={1.5}>
              <Txt size={13.5} w={700} color={C.blueBody}>
                Outcome:
              </Txt>{' '}
              you pay the total from any chain, the kitchen gets your order, and you earn points
              {punch ? ' + a loyalty stamp' : ''}. You confirm before anything moves.
            </Txt>
          </View>

          <PrimaryButton
            testID="runtime-pay"
            label={
              paying
                ? 'Confirming…'
                : cartCount === 0
                  ? 'Add items to your order'
                  : `Pay $${cartTotal.toFixed(2)} · ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`
            }
            onPress={pay}
            style={{ marginTop: 16, opacity: cartCount === 0 ? 0.55 : 1 }}
          />
        </View>
      )}

      {runState === 'form' && !isOrder && (
        <View style={{ flex: 1, marginTop: 16 }}>
          {punch && (
            <View style={{ marginBottom: 10 }}>
              <PunchCard brand={manifest.name} ens={manifest.ensName} category={manifest.category} total={punch.total} reward={punch.reward} record={record} onchain={loyaltyOnchain} />
            </View>
          )}
          <View
            style={{
              backgroundColor: C.surface,
              borderRadius: 22,
              paddingVertical: 6,
              paddingHorizontal: 18,
            }}
          >
            {amount &&
              (editableAmount ? (
                <EditableRow label={`Amount (${amount.token})`} value={amountText} onChange={setAmountText} prefix="$" keyboardType="decimal-pad" />
              ) : (
                <FormRow label="Amount" value={`$${amount.default} ${amount.token}`} bold={800} />
              ))}
            {source && <FormRow label="Pay from" value={source.value === 'any' ? 'Any chain' : source.value} />}
            {recipient && <FormRow label="Destination" value={recipient.value} valueColor={C.blueLink} />}
            {memo &&
              (editableAmount ? (
                <EditableRow label="Memo" value={memoText} onChange={setMemoText} last />
              ) : (
                <FormRow label="Memo" value={memo.default} bold={600} last />
              ))}
            {!amount && !source && !recipient && !memo && (
              <FormRow label="Action" value={submit?.label ?? 'Run'} bold={600} last />
            )}
          </View>

          {manifest.workflow.composer && (
            <View
              style={{
                backgroundColor: C.inkPanel,
                borderRadius: 18,
                paddingVertical: 13,
                paddingHorizontal: 16,
                marginTop: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
              }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Txt size={14} color={C.white}>
                  ⚡
                </Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt size={13} w={700} color={C.white}>
                  Earns yield in {manifest.workflow.composer.vaultLabel ?? 'a vault'}
                  {manifest.workflow.composer.protocol ? ` · ${manifest.workflow.composer.protocol}` : ''}
                </Txt>
                <Txt size={11.5} color="#9FB0DA" style={{ marginTop: 1 }}>
                  Swap + deposit bundled into one transaction by LI.FI Composer
                </Txt>
              </View>
            </View>
          )}

          <View
            style={{
              backgroundColor: C.blueSoft,
              borderRadius: 18,
              paddingVertical: 15,
              paddingHorizontal: 18,
              marginTop: 10,
            }}
          >
            <Txt size={13.5} color={C.blueBody} lh={1.5}>
              <Txt size={13.5} w={700} color={C.blueBody}>
                Outcome:
              </Txt>{' '}
              {cardFull && punch
                ? `your free ${punch.reward} is ready — redeeming issues a voucher and resets your card. No payment needed. `
                : `${manifest.outcome.replace(/^You will/, 'you will')} `}
              {!cardFull && manifest.permissions.worldPolicy === 'one-payment-per-human'
                ? 'One payment per verified human. '
                : !cardFull && manifest.permissions.requiresWorldId
                  ? 'One per verified human. '
                  : ''}
              You confirm before anything moves.
            </Txt>
          </View>

          <View style={{ flex: 1 }} />
          <PrimaryButton
            testID="runtime-submit"
            label={
              paying
                ? 'Checking World ID…'
                : cardFull && punch
                  ? `Redeem free ${punch.reward}`
                  : (submit?.label ?? 'Run')
            }
            onPress={cardFull ? redeem : pay}
            style={{ marginTop: 16 }}
          />
          {cardFull && (
            <Pressable onPress={pay} style={{ alignSelf: 'center', marginTop: 12 }}>
              <Txt size={13} w={600} color={C.blueLink}>
                or pay & collect another stamp
              </Txt>
            </Pressable>
          )}
        </View>
      )}

      {runState === 'processing' && (
        <View style={{ marginTop: 20 }}>
          <Txt size={18} w={800}>
            {mode === 'redeem' ? 'Redeeming your reward…' : 'Running your flow…'}
          </Txt>
          <Txt size={13} color={C.text2} style={{ marginTop: 4 }}>
            {mode === 'redeem'
              ? `${manifest.name} · reward voucher · no payment needed`
              : `${manifest.workflow.provider} · ${manifest.workflow.steps.length} steps · simulated before execution`}
          </Txt>
          <View
            style={{
              backgroundColor: C.surface,
              borderRadius: 22,
              paddingVertical: 20,
              paddingHorizontal: 18,
              marginTop: 16,
              gap: 18,
            }}
          >
            {timelineSteps.map((step, i) => {
              const done = runStep > i;
              const active = runStep === i;
              const dot = (
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: done ? C.successStrong : active ? C.blueSoft : C.stepIdleBg,
                  }}
                >
                  <Txt size={12} w={700} color={done ? C.white : active ? C.blueLink : C.stepIdleNum}>
                    {done ? '✓' : i + 1}
                  </Txt>
                </View>
              );
              return (
                <View key={step.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
                  {active ? <Pulse borderRadius={13}>{dot}</Pulse> : dot}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={14.5} w={700} color={done || active ? C.text : C.text3}>
                      {step.label}
                    </Txt>
                    <Txt size={12} color={C.text3} style={{ marginTop: 1 }}>
                      {step.detail}
                    </Txt>
                  </View>
                  <Txt size={11.5} w={700} color={done ? C.successStrong : active ? C.blueLink : C.text3}>
                    {done ? 'Done' : active ? 'In progress' : 'Queued'}
                  </Txt>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {runState === 'done' && (
        <View style={{ alignItems: 'center', paddingHorizontal: 14, paddingTop: 96 }}>
          <SuccessCheck glyph={mode === 'redeem' ? '🎁' : '✓'} />
          <Txt size={25} w={800} ls={-0.015} style={{ marginTop: 22 }}>
            {mode === 'redeem' ? 'Enjoy!' : 'Done.'}
          </Txt>
          <Txt size={15} color={C.text2} lh={1.55} center style={{ marginTop: 10, maxWidth: 270 }}>
            {doneCopy}
          </Txt>
          {mode === 'purchase' && result && !result.live && (
            <Txt size={12} color={C.text3} center style={{ marginTop: 8, maxWidth: 280 }}>
              Simulated run — fund the wallet on the Profile tab to move real USDC.
            </Txt>
          )}
          {mode === 'purchase' && (
            <Pressable
              onPress={() =>
                result?.explorerUrl
                  ? Linking.openURL(result.explorerUrl)
                  : Alert.alert(
                      'Flow details',
                      `${manifest.workflow.provider}\nFlow ${manifest.workflow.flowId}\n${manifest.workflow.steps.length} steps completed`
                    )
              }
              style={{ marginTop: 18 }}
            >
              <Txt size={13} w={600} color={C.blueLink}>
                {result?.explorerUrl ? 'View transaction' : 'View flow details'}
              </Txt>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              // Return to the dapp itself (its detail page), not the global home.
              if (ens && ens !== 'draft' && hasListing(ens)) router.replace(`/detail/${ens}`);
              else if (router.canGoBack()) router.back();
              else router.replace('/store');
            }}
            style={{
              backgroundColor: C.cta,
              borderRadius: 16,
              paddingVertical: 16,
              paddingHorizontal: 44,
              marginTop: 30,
            }}
          >
            <Txt size={15} w={700} color={C.ctaText}>
              Back to app
            </Txt>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}
