export type CompanyInfo = {
  name: string
  postal: string
  address: string
  phone: string
  email: string
  bank: string
  registrationNumber: string
}

const DEFAULTS = {
  name: '株式会社FELICITY',
  postal: '',
  address: '神奈川県三浦郡葉山町上山口2432-3',
  phone: '080-8758-4368',
  email: '',
  bank: 'SBIネット銀行  法人第一支店\n普通 2373525',
  registrationNumber: '',
} as const

export function getCompanyInfo(): CompanyInfo {
  return {
    name: process.env.COMPANY_NAME || DEFAULTS.name,
    postal: process.env.COMPANY_POSTAL || DEFAULTS.postal,
    address: process.env.COMPANY_ADDRESS || DEFAULTS.address,
    phone: process.env.COMPANY_PHONE || DEFAULTS.phone,
    email: process.env.COMPANY_EMAIL || DEFAULTS.email,
    bank: process.env.COMPANY_BANK || DEFAULTS.bank,
    registrationNumber:
      process.env.INVOICE_REGISTRATION_NUMBER || DEFAULTS.registrationNumber,
  }
}
