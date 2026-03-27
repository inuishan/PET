import { StyleSheet, Text, View } from 'react-native';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.body}>
        Parser profiles, category taxonomy, and sync health controls will live here.
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
