import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * There is no role picker: how someone arrives decides their role (Build Brief, section 3).
 * We remember the arrival until sign-in finishes so the role can be set on the account.
 */
export type Role = 'creator' | 'student';

export type Arrival = { role: 'creator' } | { role: 'student'; slug: string };

const KEY = 'tavie.arrival';

export async function setArrival(arrival: Arrival) {
  await AsyncStorage.setItem(KEY, JSON.stringify(arrival));
}

export async function getArrival(): Promise<Arrival | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Arrival) : null;
  } catch {
    return null;
  }
}

export async function clearArrival() {
  await AsyncStorage.removeItem(KEY);
}
