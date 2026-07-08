export type Issuer = 'felicity' | 'rook'

export type CompanyInfo = {
  name: string
  /** 代表者名(請求元欄で社名の上に表示。不要なら空) */
  representative: string
  postal: string
  address: string
  phone: string
  email: string
  bank: string
  registrationNumber: string
}

const DEFAULTS = {
  name: '株式会社FELICITY',
  representative: '',
  postal: '240-0115',
  address: '神奈川県三浦郡葉山町上山口2432-3',
  phone: '080-8758-4368',
  email: '',
  bank: 'SBIネット銀行  法人第一支店\n普通 2373525',
  registrationNumber: '',
} as const

const ROOK: CompanyInfo = {
  name: '株式会社ROOK',
  representative: '桐島ローランド',
  postal: '240-0111',
  address: '神奈川県三浦郡葉山町一色720-78',
  phone: '090-8879-1313',
  email: 'rkirishima@gmail.com',
  bank: '三菱東京UFJ銀行  広尾支店\n普通 0698234  株式会社ROOK',
  registrationNumber: 'T7013202013308',
}

export function getCompanyInfo(): CompanyInfo {
  return {
    name: process.env.COMPANY_NAME || DEFAULTS.name,
    representative: DEFAULTS.representative,
    postal: process.env.COMPANY_POSTAL || DEFAULTS.postal,
    address: process.env.COMPANY_ADDRESS || DEFAULTS.address,
    phone: process.env.COMPANY_PHONE || DEFAULTS.phone,
    email: process.env.COMPANY_EMAIL || DEFAULTS.email,
    bank: process.env.COMPANY_BANK || DEFAULTS.bank,
    registrationNumber:
      process.env.INVOICE_REGISTRATION_NUMBER || DEFAULTS.registrationNumber,
  }
}

/** 請求書の発行元プロファイルを返す。felicity は従来どおり env 上書き可 */
export function getIssuerInfo(issuer: Issuer): CompanyInfo {
  return issuer === 'rook' ? ROOK : getCompanyInfo()
}

export function normalizeIssuer(v: unknown): Issuer {
  return v === 'rook' ? 'rook' : 'felicity'
}
