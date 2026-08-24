import { Platform } from 'react-native';
import * as Device from 'expo-device';

/**
 * A short, human-readable device summary sent with the launch ping so the
 * admin table can show what an account was last seen on — e.g. "iPhone 15
 * Pro · iOS 18.1". Never more than this: no identifiers, nothing that
 * survives a reinstall differently from the install id already does.
 */
export function deviceLabel(): string {
  const os =
    Device.osName ??
    (Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web');
  const osPart = Device.osVersion ? `${os} ${Device.osVersion}` : os;
  return [Device.modelName, osPart].filter(Boolean).join(' · ');
}
