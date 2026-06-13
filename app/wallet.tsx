import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { ArrowUpRight, Copy, KeyRound } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { QR } from '../src/components/QR';
import { BackButton, Chip, CountUp, PrimaryButton, Screen, SectionHeader, Txt } from '../src/components/ui';
import { authenticateForSpend } from '../src/services/biometric';
import { exportPrivateKey, getWalletSnapshot, sendUsdc } from '../src/services/wallet';
import { useApp } from '../src/state/store';
import { C } from '../src/theme';

export default function WalletScreen() {
  const router = useRouter();
  const wallet = useApp((s) => s.wallet);
  const setWallet = useApp((s) => s.setWallet);
  const recordActivity = useApp((s) => s.recordActivity);
  useApp((s) => s.themeMode); // repaint on theme toggle

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getWalletSnapshot().then(setWallet).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyAddress = async () => {
    if (!wallet) return;
    await Clipboard.setStringAsync(wallet.address);
    Alert.alert('Copied', 'Wallet address copied to clipboard.');
  };

  const doSend = async () => {
    const amt = parseFloat(amount);
    if (sending || !to.trim() || !amt || amt <= 0) return;
    setSending(true);
    try {
      const ok = await authenticateForSpend(`Send $${amt.toFixed(2)} USDC`);
      if (!ok) {
        Alert.alert('Cancelled', 'Authentication was not completed.');
        return;
      }
      if (!wallet || wallet.totalUsdc < amt) {
        Alert.alert(
          'Wallet unfunded',
          'Add USDC + a little gas to this wallet to send for real. Use the address above to fund it.'
        );
        return;
      }
      const res = await sendUsdc({ to: to.trim(), amountUsd: amt });
      recordActivity({
        ens: to.trim(),
        title: `Sent to ${to.trim()}`,
        kind: 'send',
        amountUsd: amt,
        live: true,
        explorerUrl: res.explorerUrl,
      });
      Alert.alert('Sent', `$${amt.toFixed(2)} USDC sent on ${res.chainLabel}.`);
      setTo('');
      setAmount('');
      getWalletSnapshot().then(setWallet).catch(() => {});
    } catch (e) {
      Alert.alert('Send failed', String(e).slice(0, 220));
    } finally {
      setSending(false);
    }
  };

  const revealKey = async () => {
    const ok = await authenticateForSpend('Reveal your recovery key');
    if (!ok) return;
    const key = await exportPrivateKey();
    if (!key) {
      Alert.alert('No key found', 'This device has no embedded wallet key yet.');
      return;
    }
    Alert.alert(
      'Recovery key',
      `${key}\n\nWrite this down and keep it secret. Anyone with this key controls your funds. DappDock cannot recover it for you.`,
      [
        { text: 'Copy', onPress: () => Clipboard.setStringAsync(key) },
        { text: 'Done', style: 'cancel' },
      ]
    );
  };

  const inputStyle = {
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    fontSize: 14.5,
    fontFamily: 'Geist_400Regular',
    color: C.text,
  } as const;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        <View style={{ flex: 1 }}>
          <Txt size={16} w={800}>
            Wallet
          </Txt>
          <Txt size={12} w={600} color={C.text2}>
            Embedded · no networks to configure
          </Txt>
        </View>
      </View>

      {/* balance + per-chain */}
      <View style={{ backgroundColor: C.inkPanel, borderRadius: 24, padding: 20, marginTop: 16 }}>
        <Txt size={11} w={700} color="#B8C6F2" ls={0.06} style={{ textTransform: 'uppercase' }}>
          Total USDC
        </Txt>
        <CountUp
          value={wallet?.totalUsdc ?? 0}
          prefix="$"
          format={(n) => n.toFixed(2)}
          size={32}
          w={800}
          color={C.white}
          style={{ marginTop: 3 }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
          {(wallet?.balances ?? []).map((b) => (
            <View
              key={b.chainId}
              style={{
                backgroundColor: 'rgba(255,255,255,0.10)',
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              <Txt size={12} w={600} color={C.white}>
                {b.label} ${b.usdc.toFixed(2)}
              </Txt>
            </View>
          ))}
        </View>
      </View>

      {/* receive */}
      <SectionHeader title="Receive" size={17} />
      <View style={{ backgroundColor: C.surface, borderRadius: 22, padding: 18, alignItems: 'center' }}>
        {wallet ? <QR value={wallet.address} /> : <Txt size={13} color={C.text3}>Creating wallet…</Txt>}
        <Pressable
          onPress={copyAddress}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}
        >
          <Txt size={12.5} w={600} color={C.blueLink} numberOfLines={1} style={{ maxWidth: 240 }}>
            {wallet?.address ?? '—'}
          </Txt>
          <Copy size={15} color={C.text2} strokeWidth={2} />
        </Pressable>
        <Txt size={12} color={C.text3} center lh={1.45} style={{ marginTop: 8, maxWidth: 280 }}>
          Send USDC + a little gas on Base, Arbitrum, Optimism or Polygon. Funded wallets run dapps for real.
        </Txt>
      </View>

      {/* send */}
      <SectionHeader title="Send" size={17} />
      <View style={{ backgroundColor: C.surface, borderRadius: 22, padding: 18, gap: 10 }}>
        <TextInput
          value={to}
          onChangeText={setTo}
          placeholder="To: ENS name or 0x address"
          placeholderTextColor={C.text3}
          autoCapitalize="none"
          autoCorrect={false}
          style={[inputStyle, { backgroundColor: C.bg }]}
        />
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="Amount in USDC"
          placeholderTextColor={C.text3}
          keyboardType="decimal-pad"
          style={[inputStyle, { backgroundColor: C.bg }]}
        />
        <PrimaryButton
          label={sending ? 'Confirming…' : 'Send USDC'}
          onPress={doSend}
          leading={<ArrowUpRight size={17} color={C.ctaText} strokeWidth={2.4} />}
        />
        <Txt size={11.5} color={C.text3} center>
          Protected by your device biometrics where available.
        </Txt>
      </View>

      {/* backup */}
      <SectionHeader title="Backup" size={17} />
      <Pressable
        onPress={revealKey}
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
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: C.warnBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <KeyRound size={17} color={C.warn} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt size={14.5} w={700}>
            Reveal recovery key
          </Txt>
          <Txt size={12.5} color={C.text2} style={{ marginTop: 1 }}>
            Back up your wallet before you lose this device
          </Txt>
        </View>
        <Chip label="Biometric" bg={C.blueSoft} color={C.blueLink} size={10.5} px={9} py={4} />
      </Pressable>

      <Txt size={12} color={C.text3} center style={{ marginTop: 16, maxWidth: 300, alignSelf: 'center' }}>
        To fund this wallet, send USDC + a little gas to the address above on Base, Arbitrum, Optimism or
        Polygon. Unfunded runs are simulated.
      </Txt>
    </Screen>
  );
}
