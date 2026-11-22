import type { GUI, ShortcutBar } from '@/dofus-window'

export const getActiveShortcutBar = (gui: GUI): ShortcutBar | undefined => {
  const bars = gui.shortcutBarManager?.shortcutBars
  if (gui.playerData.characters.isHeroCharacterControlled?.() && bars?.heroBar) return bars.heroBar
  return bars?.playerBar ?? gui.shortcutBar
}

export const getShortcutBars = (gui: GUI): ShortcutBar[] => {
  const bars = gui.shortcutBarManager?.shortcutBars
  return [...new Set([bars?.playerBar, bars?.heroBar, gui.shortcutBar].filter((bar): bar is ShortcutBar => !!bar))]
}
