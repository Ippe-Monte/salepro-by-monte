import { Image } from 'react-native';

export function Logo({ size }: { size: number }) {
  return <Image source={require('../../assets/logo.png')} style={{ width: size, height: size, borderRadius: size * 0.24 }} accessibilityLabel="SalePro by Monte" resizeMode="contain" />;
}
