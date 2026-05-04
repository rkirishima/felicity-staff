import { Font } from '@react-pdf/renderer'

const NOTO_SANS_JP_URL =
  'https://fonts.gstatic.com/s/notosansjp/v52/-F62fjtqLzI2JPCgQBnw7HFowAIO2lZ9hg.ttf'

let registered = false

export function ensureFontsRegistered(): void {
  if (registered) return
  Font.register({
    family: 'NotoSansJP',
    src: NOTO_SANS_JP_URL,
  })
  Font.registerHyphenationCallback(word => [word])
  registered = true
}

export const FONT_FAMILY = 'NotoSansJP'
