import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { coachChat, isMockMode } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import type { ChatMessage } from '@/lib/types';

export default function Coach() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const language = useAppStore((s) => s.language) ?? 'en';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const reply = await coachChat(next, language);
      setMessages([
        ...next,
        { role: 'assistant', content: isMockMode ? t('coach.mockReply') : reply },
      ]);
    } catch {
      setMessages([...next, { role: 'assistant', content: t('common.error') }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={{ flex: 1, paddingTop: insets.top + Spacing.md }}>
        <View style={styles.titleRow}>
          <Ionicons name="sparkles" size={22} color={theme.primary} />
          <Text style={[Type.title, { color: theme.text }]}>{t('coach.title')}</Text>
        </View>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <Bubble role="assistant" text={t('coach.intro')} />
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.content} />
          ))}
          {busy && (
            <View style={[styles.bubble, styles.assistant, { backgroundColor: theme.card }]}>
              <ActivityIndicator color={theme.primary} />
            </View>
          )}
        </ScrollView>
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: theme.card,
              paddingBottom: Spacing.sm,
              borderTopColor: theme.border,
            },
          ]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('coach.placeholder')}
            placeholderTextColor={theme.textTertiary}
            style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={send}
            disabled={!input.trim() || busy}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: theme.primary, opacity: !input.trim() || busy ? 0.4 : 1 },
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
          >
            <Ionicons name="arrow-up" size={20} color={theme.onPrimary} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const theme = useTheme();
  const isUser = role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        isUser
          ? [styles.user, { backgroundColor: theme.primary }]
          : [styles.assistant, { backgroundColor: theme.card }, cardShadow(theme.shadow)],
      ]}
    >
      <Text style={{ color: isUser ? theme.onPrimary : theme.text, fontSize: 15, lineHeight: 21 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  user: { alignSelf: 'flex-end', borderBottomEndRadius: 6 },
  assistant: { alignSelf: 'flex-start', borderBottomStartRadius: 6 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 110,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
