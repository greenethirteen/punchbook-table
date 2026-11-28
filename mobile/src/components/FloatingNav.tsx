import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BagIcon, HomeIcon, UserIcon } from '@/components/icons';
import { colors } from '@/lib/theme';

type Tab = 'home' | 'orders' | 'account';
const TABS: { key: Tab; label: string; Icon: typeof HomeIcon; go: () => void }[] = [
  { key: 'home', label: 'Home', Icon: HomeIcon, go: () => router.dismissTo('/') },
  { key: 'orders', label: 'Orders', Icon: BagIcon, go: () => router.navigate('/orders') },
  { key: 'account', label: 'Account', Icon: UserIcon, go: () => router.navigate('/account') },
];

/** The floating pill menu at the bottom of Home, Orders and Account. */
export function FloatingNav({ active, badge = 0 }: { active: Tab; badge?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
      <View style={styles.pill} accessibilityRole="tablist">
        {TABS.map(({ key, label, Icon, go }) => {
          const on = key === active;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: on }}
              onPress={() => !on && go()}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Icon size={20} color={on ? colors.night : '#fff'} />
              {on && <Text style={styles.label}>{label}</Text>}
              {key === 'orders' && badge > 0 && !on && <View style={styles.dot} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Space to leave under scrolling content so the menu never covers it. */
export const NAV_SPACE = 110;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    gap: 4,
    padding: 8,
    borderRadius: 999,
    backgroundColor: colors.night,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  tab: { height: 46, minWidth: 54, paddingHorizontal: 16, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  tabOn: { backgroundColor: colors.gold },
  label: { fontSize: 14, fontWeight: '800', color: colors.night },
  dot: { position: 'absolute', top: 10, right: 14, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
