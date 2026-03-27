import { StyleSheet, Text, View } from 'react-native';

export default function TransactionsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Transactions</Text>
      <Text style={styles.body}>
        Parsed statement rows and `needs_review` highlights will appear in this tab.
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
