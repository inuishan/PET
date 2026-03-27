import { StyleSheet, Text, View } from 'react-native';

export function AuthLoadingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Restoring Session</Text>
      <Text style={styles.title}>Expense Tracking</Text>
      <Text style={styles.body}>
        Checking secure session state before unlocking the household workspace.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f2ea',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  eyebrow: {
    color: '#7a6e5d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#182026',
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 44,
  },
  body: {
    color: '#4f5b66',
    fontSize: 16,
    lineHeight: 24,
  },
});
