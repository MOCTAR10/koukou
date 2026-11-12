import { useWindowDimensions } from 'react-native';

import { describeScreen, type ScreenInfo } from './responsive';

/** Taille d'écran courante (suit rotation, multi-fenêtre et pliables). */
export function useScreen(): ScreenInfo {
  const { width, height, fontScale } = useWindowDimensions();
  return describeScreen(width, height, fontScale);
}
