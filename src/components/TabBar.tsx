import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { House, ScanLine, Sparkles, Store, User } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { Txt } from './ui';

type Tab = 'home' | 'store' | 'profile';

export function TabBar({ active }: { active: Tab }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const color = (t: Tab) => (active === t ? C.text : C.text3);

  const go = (t: Tab) => {
    if (t !== active) router.replace(`/${t}`);
  };

  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(245,246,250,0)', C.bg, C.bg]}
        locations={[0, 0.4, 1]}
        style={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: Math.max(insets.bottom, 12) + 12 }}
        pointerEvents="box-none"
      >
        <View
          style={{
            backgroundColor: C.surface,
            borderRadius: 999,
            paddingVertical: 9,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            shadowColor: '#0B1020',
            shadowOpacity: 0.1,
            shadowRadius: 26,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          <Pressable onPress={() => go('home')} style={{ alignItems: 'center', gap: 3, width: 52 }}>
            <House size={20} color={color('home')} strokeWidth={2.4} />
            <Txt size={10.5} w={700} color={color('home')}>
              Home
            </Txt>
          </Pressable>
          <Pressable onPress={() => go('store')} style={{ alignItems: 'center', gap: 3, width: 52 }}>
            <Store size={20} color={color('store')} strokeWidth={2.4} />
            <Txt size={10.5} w={700} color={color('store')}>
              Store
            </Txt>
          </Pressable>
          {/* Scan — the center action: QR codes in the real world launch dapps */}
          <Pressable
            onPress={() => router.push('/scan')}
            style={{ alignItems: 'center', width: 52, marginTop: -26 }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: C.cta,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#0B1020',
                shadowOpacity: 0.3,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 8 },
                elevation: 10,
              }}
            >
              <ScanLine size={23} color={C.ctaText} strokeWidth={2.4} />
            </View>
            <Txt size={10.5} w={700} color={C.text3} style={{ marginTop: 4 }}>
              Scan
            </Txt>
          </Pressable>
          <Pressable
            onPress={() => router.push('/assistant')}
            style={{ alignItems: 'center', gap: 3, width: 52 }}
          >
            <Sparkles size={20} color={C.text3} strokeWidth={2.4} />
            <Txt size={10.5} w={700} color={C.text3}>
              Create
            </Txt>
          </Pressable>
          <Pressable onPress={() => go('profile')} style={{ alignItems: 'center', gap: 3, width: 52 }}>
            <User size={20} color={color('profile')} strokeWidth={2.4} />
            <Txt size={10.5} w={700} color={color('profile')}>
              Profile
            </Txt>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}
