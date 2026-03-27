import { StyleSheet, Text, View } from 'react-native';

export default function DashboardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.body}>
        Phase 1 will surface statement sync health, month-to-date totals, and recent transactions
        here once ingestion is wired.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffaf2',
    gap: 12,
    padding: 24,
  },
  title: {
    color: '#182026',
    fontSize: 32,
    fontWeight: '800',
  },
  body: {
    color: '#4f5b66',
    fontSize: 16,
    lineHeight: 24,
  },
});
