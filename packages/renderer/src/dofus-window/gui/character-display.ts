import { _EntityLook } from '../dofus'
import { GUICanvas } from './gui'

export interface CharacterDisplayOptions {
  scale: 'fitin'
  horizontalAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'center' | 'bottom'
}

export type CharacterDisplayClass = new (props: CharacterDisplayOptions) => CharacterDisplay

export interface CharacterDisplay {
  new (props: CharacterDisplayOptions): CharacterDisplay
  canvas: GUICanvas
  canvasInitialized: boolean
  cts: CanvasRenderingContext2D
  entity?: _EntityLook
  horizontalAlign: 'none' | 'left' | 'center' | 'right'
  only4Directions: boolean
  renderingRequired: boolean
  rootElement: HTMLDivElement
  scale: number
  setLook: (
    look: unknown,
    props: {
      riderOnly: boolean
      direction: number
      animation: string
      boneType: string
      skinType: string
    },
    callback?: () => void
  ) => void
  clear: () => void
  release?: () => void
  resize: () => void
  rotateCharacter: (angle: number) => void
  setScale: (scale: number) => void
}
