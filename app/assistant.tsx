import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowUp, Sparkles } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, FadeUp, IconTile, Pulse, Txt, TypingDots } from '../src/components/ui';
import { hasAgentCreds, runAgentTurn } from '../src/services/agent';
import { LIFI_DIAMOND } from '../src/services/composer';
import { ENV } from '../src/services/env';
import { AgentProfile, getAgentProfile } from '../src/services/identity';
import { useApp } from '../src/state/store';
import { DappManifest } from '../src/types';
import { bgWithAlpha, C } from '../src/theme';

/** The design agent's ENS identity (ENSIP-25/26). Resolved live, never hard-coded. */
const AGENT_ENS = `assistant.agent.${ENV.ensDomain}`;

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum',
};

/**
 * Composer flow inspector — visualizes how LI.FI Composer bundles the drafted
 * dapp's swap + deposit into a single transaction (the destination vault, the
 * op sequence, and the one execution contract). A small Composer dev/debug tool
 * surfaced right in the Flow tab.
 */
function ComposerInspector({
  composer,
  tool,
}: {
  composer: NonNullable<DappManifest['workflow']['composer']>;
  tool?: string;
}) {
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const chain = CHAIN_NAMES[composer.vaultChainId] ?? `chain ${composer.vaultChainId}`;
  const ops = [
    { k: 'swap', label: 'Swap to USDC', detail: 'From any input token' },
    { k: 'bridge', label: `Bridge to ${chain}`, detail: 'Only if funds start elsewhere' },
    { k: 'deposit', label: `Deposit into ${composer.vaultLabel ?? 'vault'}`, detail: composer.protocol ? `${composer.protocol} vault` : 'yield vault' },
  ];
  const kv = (k: string, v: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Txt size={11.5} color="#9FB0DA">{k}</Txt>
      <Txt size={11.5} w={600} color={C.white} numberOfLines={1} style={{ flexShrink: 1 }}>{v}</Txt>
    </View>
  );
  return (
    <View style={{ backgroundColor: C.inkPanel, borderRadius: 18, padding: 16, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt size={11} w={700} color="#B8C6F2" ls={0.06} style={{ textTransform: 'uppercase' }}>
          Composer · {ops.length} ops
        </Txt>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Txt size={11} w={700} color={C.white}>
            1 transaction
          </Txt>
        </View>
      </View>
      <View style={{ marginTop: 12, gap: 9 }}>
        {ops.map((op, i) => (
          <View key={op.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={11} w={700} color={C.white}>
                {i + 1}
              </Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt size={13.5} w={700} color={C.white}>
                {op.label}
              </Txt>
              <Txt size={11.5} color="#9FB0DA">
                {op.detail}
              </Txt>
            </View>
          </View>
        ))}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', marginTop: 12, paddingTop: 10, gap: 5 }}>
        {kv('Execution', `LI.FI Diamond ${short(LIFI_DIAMOND)}`)}
        {kv('Vault', `${short(composer.vaultToken)} · ${chain}`)}
        {tool ? kv('Routed via', tool) : null}
      </View>
    </View>
  );
}

const PROMPT_CHIPS = [
  'Collect payments',
  'Create a voting app',
  'Token-gate a community',
  'Event check-in',
  'Build an agent tool',
  'Start from scratch',
];

const CHIP_PROMPTS: Record<string, string> = {
  'Collect payments':
    'Create a dapp where my hackathon team can pay $5 USDC from any chain, route it to our treasury at team.eth, and mark verified members as paid.',
  'Create a voting app': 'Create a voting dapp where each verified human gets exactly one vote.',
  'Token-gate a community': 'Create a dapp that token-gates my community so only verified members can join.',
  'Event check-in': 'Create an event check-in dapp where each verified human can claim one pass.',
  'Build an agent tool': 'Create a marketplace dapp for hiring human-backed research agents with capped budgets.',
  'Start from scratch': '',
};

function DraftCard({ manifest, onOpen }: { manifest: DappManifest; onOpen: () => void }) {
  const monogram = manifest.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View
      style={{
        backgroundColor: C.surface,
        borderRadius: 24,
        padding: 18,
        borderWidth: 1.5,
        borderColor: C.blueSoft,
        shadowColor: '#3450A1',
        shadowOpacity: 0.08,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile label={monogram} size={46} radius={15} fontSize={15} />
        <View style={{ flex: 1 }}>
          <Txt size={16} w={800}>
            {manifest.name}
          </Txt>
          <Txt size={12} color={C.text2} style={{ marginTop: 1 }} numberOfLines={1}>
            {manifest.description}
          </Txt>
        </View>
      </View>
      <View style={{ gap: 7, marginTop: 14 }}>
        {[
          ['Identity', manifest.ensName, C.blueLink],
          [
            'Workflow',
            manifest.workflow.steps.length
              ? `${manifest.workflow.steps[0].label.split(' ').slice(0, 2).join(' ')} → ${
                  (manifest.components.find((c) => c.type === 'recipient') as any)?.value ?? 'done'
                }`
              : 'Custom flow',
            C.text,
          ],
          [
            'Access',
            manifest.permissions.requiresWorldId ? 'World ID required' : 'Open to everyone',
            manifest.permissions.requiresWorldId ? C.success : C.text,
          ],
        ].map(([label, value, color]) => (
          <View
            key={label as string}
            style={{
              backgroundColor: C.bg,
              borderRadius: 13,
              paddingVertical: 10,
              paddingHorizontal: 13,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Txt size={11} w={700} color={C.text3} ls={0.05} style={{ textTransform: 'uppercase' }}>
              {label}
            </Txt>
            <Txt size={12.5} w={700} color={color as string} numberOfLines={1} style={{ flexShrink: 1 }}>
              {value}
            </Txt>
          </View>
        ))}
      </View>
      <Pressable
        onPress={onOpen}
        style={{ backgroundColor: C.cta, borderRadius: 13, padding: 13, alignItems: 'center', marginTop: 14 }}
      >
        <Txt size={14} w={700} color={C.ctaText}>
          Open preview →
        </Txt>
      </Pressable>
    </View>
  );
}

export default function Assistant() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [tab, setTab] = useState<'chat' | 'flow'>('chat');
  const [input, setInput] = useState('');

  const { messages, agentBusy, apiHistory, draft, simulation, pushMessage, setAgentBusy, setDraft } =
    useApp();

  // ENSIP-26: resolve the agent's on-chain identity (address + agent-context).
  // Real ENS read via the Universal Resolver — drives the verified badge below.
  const [agentId, setAgentId] = useState<AgentProfile | null>(null);
  useEffect(() => {
    getAgentProfile(AGENT_ENS)
      .then(setAgentId)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, [messages.length, agentBusy]);

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || agentBusy) return;
    setInput('');
    pushMessage({ kind: 'chat', role: 'user', text: prompt });
    setAgentBusy(true);
    try {
      await runAgentTurn(apiHistory, prompt, {
        onText: (t) => pushMessage({ kind: 'chat', role: 'assistant', text: t }),
        onActivity: (label) => pushMessage({ kind: 'activity', label }),
        onDraft: (manifest) => {
          setDraft(manifest);
          pushMessage({ kind: 'card' });
        },
      });
    } catch (e) {
      pushMessage({
        kind: 'chat',
        role: 'assistant',
        text: `Something went wrong talking to the model: ${String(e).slice(0, 200)}`,
      });
    } finally {
      setAgentBusy(false);
    }
  };

  const showChips = messages.length === 0;
  const segStyle = (on: boolean) => ({
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: on ? C.surface : 'transparent',
    shadowColor: on ? '#0B1020' : 'transparent',
    shadowOpacity: on ? 0.08 : 0,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: on ? 2 : 0,
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FadeUp style={{ flex: 1 }}>
        {/* header */}
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
            <View style={{ flex: 1 }}>
              <Txt size={16} w={800}>
                Create assistant
              </Txt>
              <Txt size={12} w={600} color={C.blueLink} numberOfLines={1}>
                {AGENT_ENS} · {agentId?.verified ? 'verified on ENS' : 'human-backed'}
                {hasAgentCreds() ? '' : ' · template mode'}
              </Txt>
            </View>
          </View>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: C.segBg,
              borderRadius: 999,
              padding: 4,
              marginTop: 14,
            }}
          >
            <Pressable onPress={() => setTab('chat')} style={segStyle(tab === 'chat')}>
              <Txt size={13.5} w={tab === 'chat' ? 700 : 600} color={tab === 'chat' ? C.text : C.text2}>
                Chat
              </Txt>
            </Pressable>
            <Pressable onPress={() => setTab('flow')} style={segStyle(tab === 'flow')}>
              <Txt size={13.5} w={tab === 'flow' ? 700 : 600} color={tab === 'flow' ? C.text : C.text2}>
                Flow
              </Txt>
            </Pressable>
          </View>
        </View>

        {tab === 'chat' ? (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: 96 + insets.bottom, gap: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {/* opening bubble */}
              <View style={{ alignItems: 'flex-start' }}>
                <View
                  style={{
                    backgroundColor: C.surface,
                    borderRadius: 18,
                    borderBottomLeftRadius: 6,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    maxWidth: '85%',
                  }}
                >
                  <Txt size={14} lh={1.5}>
                    What dapp do you want to create?
                  </Txt>
                </View>
              </View>

              {showChips && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingLeft: 4 }}>
                  {PROMPT_CHIPS.map((chip, i) => {
                    const pill = (
                      <Pressable
                        onPress={() =>
                          chip === 'Start from scratch' ? setInput('') : send(CHIP_PROMPTS[chip])
                        }
                        style={{
                          backgroundColor: i === 0 ? C.blueSoft : C.surface,
                          borderRadius: 999,
                          paddingVertical: 9,
                          paddingHorizontal: 15,
                        }}
                      >
                        <Txt size={13} w={i === 0 ? 700 : 600} color={i === 0 ? C.blueBody : C.textNote}>
                          {chip}
                        </Txt>
                      </Pressable>
                    );
                    return i === 0 ? (
                      <Pulse key={chip} duration={2400}>
                        {pill}
                      </Pulse>
                    ) : (
                      <View key={chip}>{pill}</View>
                    );
                  })}
                </View>
              )}

              {messages.map((m, i) => {
                if (m.kind === 'activity') {
                  return (
                    <FadeUp key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
                      <Sparkles size={12} color={C.text3} strokeWidth={2.2} />
                      <Txt size={12} w={600} color={C.text3}>
                        {m.label}
                      </Txt>
                    </FadeUp>
                  );
                }
                if (m.kind === 'card') {
                  return draft ? (
                    <FadeUp key={i}>
                      <DraftCard manifest={draft} onOpen={() => router.push('/preview')} />
                    </FadeUp>
                  ) : null;
                }
                const user = m.role === 'user';
                return (
                  <FadeUp key={i} style={{ alignItems: user ? 'flex-end' : 'flex-start' }}>
                    <View
                      style={{
                        backgroundColor: user ? C.cta : C.surface,
                        borderRadius: 18,
                        borderBottomRightRadius: user ? 6 : 18,
                        borderBottomLeftRadius: user ? 18 : 6,
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        maxWidth: user ? '82%' : '86%',
                      }}
                    >
                      <Txt size={14} lh={1.5} color={user ? C.ctaText : C.text}>
                        {m.text}
                      </Txt>
                    </View>
                  </FadeUp>
                );
              })}

              {agentBusy && (
                <View style={{ alignItems: 'flex-start' }}>
                  <View
                    style={{
                      backgroundColor: C.surface,
                      borderRadius: 18,
                      borderBottomLeftRadius: 6,
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                    }}
                  >
                    <TypingDots />
                  </View>
                </View>
              )}
            </ScrollView>

            {/* input */}
            <LinearGradient
              colors={[bgWithAlpha(0), C.bg, C.bg]}
              locations={[0, 0.3, 1]}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                paddingHorizontal: 20,
                paddingTop: 14,
                paddingBottom: Math.max(insets.bottom, 12) + 14,
                flexDirection: 'row',
                gap: 9,
                alignItems: 'center',
              }}
            >
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Describe your dapp…"
                placeholderTextColor={C.text3}
                onSubmitEditing={() => send(input)}
                returnKeyType="send"
                style={{
                  flex: 1,
                  backgroundColor: C.surface,
                  borderRadius: 999,
                  paddingVertical: 14,
                  paddingHorizontal: 18,
                  fontSize: 14,
                  fontFamily: 'Geist_400Regular',
                  color: C.text,
                  shadowColor: '#0B1020',
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              />
              <Pressable
                onPress={() => send(input)}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  backgroundColor: C.cta,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ArrowUp size={19} color={C.ctaText} strokeWidth={2.4} />
              </Pressable>
            </LinearGradient>
          </KeyboardAvoidingView>
        ) : (
          /* FLOW TAB */
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}
            showsVerticalScrollIndicator={false}
          >
            {draft ? (
              <View>
                <Txt size={12} color={C.text2}>
                  LI.FI Composer flow ·{' '}
                  <Txt size={12} w={700} color={draft.workflow.simulated ? C.success : C.warn}>
                    {draft.workflow.simulated ? 'simulation passed' : 'not simulated yet'}
                  </Txt>
                  {simulation?.live && simulation.tool ? (
                    <Txt size={12} color={C.text2}>
                      {' '}
                      · via {simulation.tool}
                    </Txt>
                  ) : null}
                </Txt>
                {draft.workflow.composer && (
                  <ComposerInspector composer={draft.workflow.composer} tool={simulation?.tool} />
                )}
                <View
                  style={{
                    backgroundColor: C.surface,
                    borderRadius: 22,
                    paddingVertical: 20,
                    paddingHorizontal: 18,
                    marginTop: 12,
                  }}
                >
                  {draft.workflow.steps.map((step, i) => {
                    const last = i === draft.workflow.steps.length - 1;
                    return (
                      <View key={step.id} style={{ flexDirection: 'row', gap: 13 }}>
                        <View style={{ alignItems: 'center' }}>
                          <View
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 13,
                              backgroundColor: last ? C.successBg : C.blueSoft,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Txt size={12} w={700} color={last ? C.success : C.blueLink}>
                              {last ? '✓' : i + 1}
                            </Txt>
                          </View>
                          {!last && (
                            <View style={{ width: 2, flex: 1, backgroundColor: C.divider, marginVertical: 4 }} />
                          )}
                        </View>
                        <View style={{ flex: 1, paddingBottom: last ? 0 : 18 }}>
                          <Txt size={14.5} w={700}>
                            {step.label}
                          </Txt>
                          <Txt size={12.5} color={C.text2} style={{ marginTop: 2 }}>
                            {step.detail}
                          </Txt>
                        </View>
                      </View>
                    );
                  })}
                </View>
                <View
                  style={{
                    backgroundColor: C.blueSoft,
                    borderRadius: 18,
                    paddingVertical: 14,
                    paddingHorizontal: 17,
                    marginTop: 10,
                  }}
                >
                  <Txt size={13} color={C.blueBody} lh={1.5}>
                    <Txt size={13} w={700} color={C.blueBody}>
                      Boundary:
                    </Txt>{' '}
                    the agent drafted and simulated this flow. Spending and publishing always require your
                    confirmation.
                  </Txt>
                </View>
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingTop: 90 }}>
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
                  <Sparkles size={22} color={C.text3} strokeWidth={2} />
                </View>
                <Txt size={16} w={700} style={{ marginTop: 16 }}>
                  No flow yet
                </Txt>
                <Txt size={13.5} color={C.text2} center style={{ marginTop: 6 }}>
                  Describe a dapp in the chat and the{'\n'}assistant will compose one.
                </Txt>
              </View>
            )}
          </ScrollView>
        )}
      </FadeUp>
    </View>
  );
}
