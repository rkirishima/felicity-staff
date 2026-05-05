import path from 'path'
import { Font } from '@react-pdf/renderer'

let registered = false

export function ensureFontsRegistered(): void {
  if (registered) return
  const fontPath = path.join(process.cwd(), 'public/fonts/NotoSansJP-Regular.otf')
  Font.register({
    family: 'NotoSansJP',
    src: fontPath,
  })
  Font.registerHyphenationCallback(word => [word])
  registered = true
}

export const FONT_FAMILY = 'NotoSansJP'
