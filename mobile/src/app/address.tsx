import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LocationMap, type MapHandle } from '@/components/LocationMap';
import { Button, Notice } from '@/components/ui';
import { colors, radius } from '@/lib/theme';
import { useOrders, type Address } from '@/state/orders';

// Colombo, for when there is no saved address and no GPS yet.
const FALLBACK = { lat: 6.9271, lng: 79.8612, zoom: 13 };
// Stop refining once the GPS is this sure, or after this long.
const GOOD_ENOUGH_M = 8;
const GPS_WINDOW_MS = 20000;

type Place = { line: string; area: string };

// Where Google has no street address it returns a Plus Code (e.g. "7MXQ+2F4"), which means nothing to a rider.
const PLUS_CODE = /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{0,3}\b/gi;

/** Splits an address into comma parts, dropping Plus Codes, the country and repeats. */
function parts(text: string | null | undefined, country: string | null) {
  return (text ?? '')
    .split(',')
    .map(p => p.replace(PLUS_CODE, '').trim())
    .filter(p => p && p !== country);
}

async function lookUp(lat: number, lng: number): Promise<Place | null> {
  const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
  if (!a) return null;
  const area = parts(a.district || a.city || a.subregion || a.region, a.country)[0] ?? '';
  const street = [a.streetNumber, a.street].filter(Boolean).join(' ');
  // Android's formatted address is the most complete; otherwise build one from the pieces.
  const line = parts(a.formattedAddress, a.country);
  const pieces = line.length ? line : [...parts(a.name, a.country), ...parts(street, a.country), area];
  return { line: [...new Set(pieces.filter(Boolean))].join(', '), area };
}

export default function AddressScreen() {
  const insets = useSafeAreaInsets();
  const { profile, saveProfile } = useOrders();
  const saved = profile.address;
  const map = useRef<MapHandle>(null);

  const [point, setPoint] = useState(saved ? { lat: saved.lat, lng: saved.lng } : null);
  const [place, setPlace] = useState<Place | null>(saved ? { line: saved.line, area: saved.area } : null);
  const [details, setDetails] = useState(saved?.details ?? '');
  const [accuracy, setAccuracy] = useState<number | null>(saved?.accuracy ?? null);
  const [status, setStatus] = useState<'idle' | 'locating' | 'denied' | 'off'>('idle');
  const [moving, setMoving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [satellite, setSatellite] = useState(false);

  const watch = useRef<Location.LocationSubscription | null>(null);
  const following = useRef(false);
  const lookup = useRef(0);

  const stopGps = () => {
    watch.current?.remove();
    watch.current = null;
    following.current = false;
    setStatus(s => (s === 'locating' ? 'idle' : s));
  };

  /** Follows the GPS, keeping the most accurate fix, until it is precise enough or the window ends. */
  const locate = async () => {
    stopGps();
    await follow();
  };

  const follow = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return setStatus('denied');
    if (!(await Location.hasServicesEnabledAsync())) {
      // Shows Android's "turn on location" dialog, which also enables Google's high-accuracy mode.
      await Location.enableNetworkProviderAsync().catch(() => {});
      if (!(await Location.hasServicesEnabledAsync())) return setStatus('off');
    }
    setStatus('locating');
    following.current = true;

    let best = Infinity;
    const take = (p: Location.LocationObject) => {
      const acc = p.coords.accuracy ?? 999;
      if (!following.current || acc >= best) return;
      best = acc;
      setAccuracy(Math.round(acc));
      map.current?.centerOn(p.coords.latitude, p.coords.longitude, acc, acc < 30 ? 19 : 17);
      if (acc <= GOOD_ENOUGH_M) stopGps();
    };

    // A recent fix shows the right neighbourhood at once while the GPS sharpens it.
    Location.getLastKnownPositionAsync({ maxAge: 60000 }).then(p => p && take(p)).catch(() => {});
    watch.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      take,
    );
    setTimeout(() => following.current && stopGps(), GPS_WINDOW_MS);
  };

  useEffect(() => {
    if (!saved) follow();
    return () => watch.current?.remove();
    // Only on open: a saved address is shown as is until the customer asks to relocate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (saved) map.current?.centerOn(saved.lat, saved.lng, null, 18);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSettle = async (lat: number, lng: number, byUser: boolean) => {
    setMoving(false);
    setPoint({ lat, lng });
    if (byUser) setAccuracy(null);
    const id = ++lookup.current;
    setLooking(true);
    try {
      const found = await lookUp(lat, lng);
      if (id === lookup.current) setPlace(found);
    } catch {
      if (id === lookup.current) setPlace(null);
    } finally {
      if (id === lookup.current) setLooking(false);
    }
  };

  const save = () => {
    if (!point) return;
    const address: Address = {
      line: place?.line || `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`,
      area: place?.area || '',
      details: details.trim(),
      lat: point.lat,
      lng: point.lng,
      accuracy,
    };
    saveProfile({ address });
    router.back();
  };

  const pinLifted = moving || status === 'locating';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.mapWrap}>
        <LocationMap
          ref={map}
          initial={saved ? { lat: saved.lat, lng: saved.lng, zoom: 18 } : FALLBACK}
          onDragStart={() => {
            stopGps();
            setMoving(true);
          }}
          onSettle={onSettle}
        />

        <View pointerEvents="none" style={styles.pinLayer}>
          <View style={[styles.pin, pinLifted && { transform: [{ translateY: -8 }] }]}>
            <View style={styles.pinHead}>
              <View style={styles.pinDot} />
            </View>
            <View style={styles.pinStem} />
          </View>
          <View style={styles.pinShadow} />
        </View>

        <View style={styles.topRow} pointerEvents="box-none">
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {status === 'locating'
                ? accuracy
                  ? `Sharpening GPS · ±${accuracy} m`
                  : 'Finding you…'
                : accuracy
                  ? `GPS accurate to ±${accuracy} m`
                  : 'Drag the map to move the pin'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: satellite }}
            accessibilityLabel="Satellite view"
            onPress={() => {
              map.current?.setSatellite(!satellite);
              setSatellite(!satellite);
            }}
            style={styles.chipButton}
          >
            <Text style={styles.chipText}>{satellite ? 'Map' : 'Satellite'}</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Use my current location" onPress={locate} style={styles.locate}>
          <View style={styles.locateRing}>
            <View style={styles.locateDot} />
          </View>
        </Pressable>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        {status === 'denied' && (
          <Notice message="Location is off for Punchbook. Allow it in Settings, or drag the map to your spot." onRetry={() => Linking.openSettings()} retryLabel="Open settings" />
        )}
        {status === 'off' && <Notice message="Your phone’s location is turned off. Turn it on, then try again." onRetry={locate} />}

        <Text style={styles.kicker}>Your address</Text>
        <Text style={styles.line} numberOfLines={2}>
          {moving ? 'Release to set the pin' : looking && !place ? 'Finding the address…' : place?.line || (point ? 'Pinned on the map' : 'Finding you…')}
        </Text>
        {!!place && !moving && (
          <Text style={styles.area}>
            {place.line === place.area || !place.line ? 'No street address here. Add a house no. or landmark below.' : place.area}
          </Text>
        )}

        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder="House / flat no., floor, landmark"
          placeholderTextColor="#9b9a93"
          maxLength={160}
          style={styles.input}
        />
        <Button label="Save address" onPress={save} disabled={!point || moving} style={{ marginTop: 14 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const PIN = 34;

const styles = StyleSheet.create({
  mapWrap: { flex: 1, backgroundColor: colors.line, overflow: 'hidden' },
  // The pin's tip sits exactly on the map's centre.
  pinLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pin: { alignItems: 'center', marginBottom: PIN + 14 },
  pinHead: {
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  pinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  pinStem: { width: 3, height: 14, backgroundColor: colors.ink, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  pinShadow: { position: 'absolute', width: 10, height: 4, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.3)' },
  topRow: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  chip: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 1 },
  chipButton: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '800', color: colors.ink },
  locate: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  locateRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  locateDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    marginTop: -radius.lg,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted },
  line: { fontSize: 19, lineHeight: 24, fontWeight: '900', letterSpacing: -0.4, color: colors.ink, marginTop: 6, minHeight: 48 },
  area: { fontSize: 14, color: colors.muted },
  input: {
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 14,
  },
});
