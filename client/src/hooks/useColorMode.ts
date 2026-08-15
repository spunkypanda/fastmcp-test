import { useSyncExternalStore } from "react";
import {
  getColorMode,
  setColorMode,
  subscribeColorMode,
  toggleColorMode,
  type ColorMode,
} from "../theme/colorMode";

export function useColorMode() {
  const colorMode = useSyncExternalStore(subscribeColorMode, getColorMode);
  return {
    colorMode,
    setColorMode,
    toggle: toggleColorMode,
  } as {
    colorMode: ColorMode;
    setColorMode: (mode: ColorMode) => void;
    toggle: () => void;
  };
}
