import { Redirect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { BackButton, PrimaryButton, Screen, Txt } from '../src/components/ui';
import { publishSubname } from '../src/services/identity';
import { listingFromManifest, useApp } from '../src/state/store';
import { C } from '../src/theme';

function CheckRow({ title, sub }: { title: string; sub: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: C.surface,
        borderRadius: 20,
        padding: 16,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: C.successBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt size={12} w={700} color={C.success}>
          ✓
        </Txt>
      </View>
      <View style={{ flex: 1 }}>
        <Txt size={15} w={700}>
          {title}
        </Txt>
        <Txt size={12.5} color={C.text2} style={{ marginTop: 2 }}>
          {sub}
        </Txt>
      </View>
    </View>
  );
}

export default function Publish() {
  const router = useRouter();
  const { draft, builderCredits, verified, addListing, markPublished, setDraftPublishedLive } = useApp();
  const [publishing, setPublishing] = useState(false);

  if (!draft) return <Redirect href="/assistant" />;

  const outOfCredits = builderCredits <= 0;

  const publish = async () => {
    if (publishing) return;
    if (outOfCredits) {
      Alert.alert('No builder credits left', 'You’ve used all 3 builder credits for now.');
      return;
    }
    setPublishing(true);
    try {
      const result = await publishSubname(draft);
      setDraftPublishedLive(result.live);
      addListing(listingFromManifest({ ...draft, ensName: result.ensName }));
      markPublished();
      router.replace('/success');
    } catch (e) {
      Alert.alert('Publish failed', String(e));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Screen scroll={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/preview'))} />
        <Txt size={16} w={800}>
          Publish
        </Txt>
      </View>

      <Txt size={14} color={C.text2} lh={1.5} style={{ marginTop: 16 }}>
        Everything below was checked automatically. Publishing requires your confirmation — the assistant
        can’t do it alone.
      </Txt>

      <View style={{ gap: 8, marginTop: 16 }}>
        <CheckRow
          title="ENS identity assigned"
          sub={`${draft.ensName} · manifest in ENS text records (register on-chain to go live)`}
        />
        <CheckRow
          title="World ID rule set"
          sub={
            draft.permissions.requiresWorldId
              ? draft.permissions.worldPolicy === 'one-payment-per-human'
                ? 'One verified human per payment'
                : 'One verified human per use'
              : 'Open access — no World ID gate'
          }
        />
        <CheckRow
          title="LI.FI flow simulated"
          sub={`${draft.workflow.steps.length} steps · ${draft.workflow.simulated ? 'simulation passed' : 'route validated at run time'}`}
        />
        <CheckRow
          title="Permissions reviewed"
          sub={`${draft.permissions.spendingCap.includes('USDC') && Number.isFinite(parseFloat(draft.permissions.spendingCap)) ? '$' + parseFloat(draft.permissions.spendingCap).toFixed(2) : draft.permissions.spendingCap} spending cap · confirmation required`}
        />
        <CheckRow
          title="Store listing ready"
          sub={`${draft.category}${draft.secondaryCategory ? ' / ' + draft.secondaryCategory : ''} · ${builderCredits} of 3 builder credits left`}
        />
      </View>

      <View style={{ flex: 1 }} />
      <PrimaryButton
        label={outOfCredits ? 'No builder credits left' : publishing ? 'Publishing…' : 'Publish to DappDock'}
        onPress={publish}
        style={{ marginTop: 16, opacity: outOfCredits ? 0.5 : 1 }}
      />
      {!verified && (
        <Txt size={12} color={C.text3} center style={{ marginTop: 10 }}>
          Publishing uses 1 builder credit. Verified humans get 3.
        </Txt>
      )}
    </Screen>
  );
}
