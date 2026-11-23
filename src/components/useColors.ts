import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

/** The color palette for the current light/dark mode. */
export function useColors() {
  return Colors[useColorScheme()];
}
