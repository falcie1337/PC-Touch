import { MODS } from '@/mods'
import { useEffect, useRef } from 'react'
import { GameManager, GameManagerProps } from './game-manager'

export const useGameManager = (props: Omit<GameManagerProps, 'modTypes'>) => {
  const manager = useRef<GameManager>()
  if (!manager.current) manager.current = new GameManager({ ...props, modTypes: MODS })
  useEffect(() => () => manager.current?.destroy(), [])
  return manager.current
}
