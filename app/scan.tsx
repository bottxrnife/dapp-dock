import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { ScanLine } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { BackButton, Chip, FadeUp, Txt } from '../src/components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { routeForPayload } from '../src/services/links';
import { useApp } from '../src/state/store';
import { C } from '../src/theme';

/** QRs you can "scan" without a printed code — also the demo path on web. */
const DEMO_CODES: Array<{ label: string; payload: string }> = [
  { label: '💸 Pay a wallet', payload: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' },
  { label: '🧑 Pay alice.eth', payload: 'alice.eth' },
  { label: '🍽️ Order at table', payload: 'dappdock://runtime/bistro.dappdock.eth' },
  { label: '🍔 Burger counter', payload: 'dappdock://runtime/burgerblock.dappdock.eth' },
  { label: '🎟️ Event check-in', payload: 'dappdock://checkin/tickets.dappdock.eth' },
  { label: '🅿️ Parking meter', payload: 'dappdock://runtime/parking.dappdock.eth' },
  { label: '🫙 Tip jar', payload: 'dappdock://runtime/tipjar.dappdock.eth' },
];

export default function Scan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useApp((s) => s.themeMode); // repaint on theme toggle
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  const cameraSupported = Platform.OS !== 'web';

  const handlePayload = (data: string) => {
    if (handledRef.current) return;
    const route = routeForPayload(data.trim());
    if (!route) {
      setError('That code doesn’t contain a dapp link or ENS name.');
      return;
    }
    if (!route.known && !route.path.startsWith('/detail/')) {
      setError('That dapp isn’t in the store yet.');
      return;
    }
    handledRef.current = true;
    router.replace(route.path as any);
  };

  const renderCamera = () => {
    if (!permission) return null;
    if (!permission.granted) {
      return (
        <View
          style={{
            flex: 1,
            borderRadius: 28,
            backgroundColor: C.inkPanel,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 28,
          }}
        >
          <ScanLine size={34} color={C.white} strokeWidth={2} />
          <Txt size={15} w={700} color={C.white} center style={{ marginTop: 16 }}>
            Camera access needed
          </Txt>
          <Txt size={13} color="#B8C6F2" center lh={1.5} style={{ marginTop: 6, maxWidth: 250 }}>
            Point at any QR — a wallet to pay, a restaurant table to order, an event door to check in,
            or any dapp someone built.
          </Txt>
          <Pressable
            onPress={requestPermission}
            style={{
              backgroundColor: C.white,
              borderRadius: 13,
              paddingVertical: 12,
              paddingHorizontal: 24,
              marginTop: 18,
            }}
          >
            <Txt size={14} w={700} color="#0B1020">
              Allow camera
            </Txt>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={{ flex: 1, borderRadius: 28, overflow: 'hidden' }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => handlePayload(data)}
        />
        {/* viewfinder */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: 210,
              height: 210,
              borderRadius: 24,
              borderWidth: 2.5,
              borderColor: 'rgba(255,255,255,0.9)',
            }}
          />
          <Txt size={12.5} w={600} color={C.white} center style={{ marginTop: 14 }}>
            Point at any QR — pay, order, check in
          </Txt>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FadeUp
        style={{
          flex: 1,
          paddingTop: insets.top + 10,
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 12) + 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
          <View style={{ flex: 1 }}>
            <Txt size={16} w={800}>
              Scan
            </Txt>
            <Txt size={12} w={600} color={C.text2}>
              One QR, many actions — pay, order, check in
            </Txt>
          </View>
        </View>

        <View style={{ flex: 1, marginTop: 16 }}>
          {cameraSupported ? (
            renderCamera()
          ) : (
            <View
              style={{
                flex: 1,
                borderRadius: 28,
                backgroundColor: C.inkPanel,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 28,
              }}
            >
              <ScanLine size={34} color={C.white} strokeWidth={2} />
              <Txt size={15} w={700} color={C.white} center style={{ marginTop: 16 }}>
                Camera scanning works on your phone
              </Txt>
              <Txt size={13} color="#B8C6F2" center lh={1.5} style={{ marginTop: 6, maxWidth: 250 }}>
                On web, paste a dapp link below or try one of the demo codes.
              </Txt>
            </View>
          )}
        </View>

        {error && (
          <Txt size={12.5} w={600} color={C.danger} center style={{ marginTop: 10 }}>
            {error}
          </Txt>
        )}

        {/* manual entry */}
        <View style={{ flexDirection: 'row', gap: 9, alignItems: 'center', marginTop: 12 }}>
          <TextInput
            value={manual}
            onChangeText={(t) => {
              setManual(t);
              setError(null);
            }}
            placeholder="Paste a dapp link or ENS name…"
            placeholderTextColor={C.text3}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => manual.trim() && handlePayload(manual)}
            returnKeyType="go"
            style={{
              flex: 1,
              backgroundColor: C.surface,
              borderRadius: 999,
              paddingVertical: 13,
              paddingHorizontal: 18,
              fontSize: 13.5,
              fontFamily: 'Geist_400Regular',
              color: C.text,
            }}
          />
          <Pressable
            onPress={() => manual.trim() && handlePayload(manual)}
            style={{
              backgroundColor: C.cta,
              borderRadius: 999,
              paddingVertical: 13,
              paddingHorizontal: 18,
            }}
          >
            <Txt size={13} w={700} color={C.ctaText}>
              Open
            </Txt>
          </Pressable>
        </View>

        {/* demo codes */}
        <View style={{ marginTop: 14 }}>
          <Txt size={11} w={700} color={C.text3} ls={0.05} style={{ textTransform: 'uppercase' }}>
            Try a demo code
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
            {DEMO_CODES.map((d) => (
              <Chip
                key={d.label}
                label={d.label}
                bg={C.blueSoft}
                color={C.blueBody}
                size={12.5}
                px={13}
                py={8}
                onPress={() => handlePayload(d.payload)}
              />
            ))}
          </View>
        </View>
      </FadeUp>
    </View>
  );
}
