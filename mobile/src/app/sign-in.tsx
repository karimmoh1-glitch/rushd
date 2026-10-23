import { useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RushdLogo } from "@/components/rushd-logo";
import { Text } from "@/components/text";
import { Field } from "@/components/field";
import { Button } from "@/components/button";
import { OfflineBanner } from "@/components/states";
import { useAuth } from "@/lib/auth/auth-context";
import { API_URL, ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";

export default function SignInScreen() {
  const { signIn } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
          gap: 28,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 18 }}>
          <RushdLogo scale={1.15} />
          <View style={{ gap: 6 }}>
            <Text variant="display" accessibilityRole="header">
              Know what to do next.
            </Text>
            <Text tone="muted">Sign in with your Rushd account to see today&apos;s plan, your deadlines, and your courses.</Text>
          </View>
        </View>

        <View style={{ gap: 16 }}>
          {error ? <OfflineBanner message={error} /> : null}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder="you@school.edu"
          />
          <Field
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Button label={busy ? "Signing in" : "Sign in"} variant="signal" size="lg" busy={busy} onPress={submit} />
        </View>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="No account yet? Create one on the web"
          onPress={() => void Linking.openURL(`${API_URL}/signup`)}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text variant="caption" tone="muted">
            No account yet? <Text variant="caption" tone="signal">Create one on the web</Text>, then sign in here.
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
