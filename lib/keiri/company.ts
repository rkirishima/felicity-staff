export type CompanyInfo = {
  name: string
  postal: string
  address: string
  phone: string
  email: string
  bank: string
  registrationNumber: string
}

export function getCompanyInfo(): CompanyInfo {
  return {
    name: process.env.COMPANY_NAME ?? '',
    postal: process.env.COMPANY_POSTAL ?? '',
    address: process.env.COMPANY_ADDRESS ?? '',
    phone: process.env.COMPANY_PHONE ?? '',
    email: process.env.COMPANY_EMAIL ?? '',
    bank: process.env.COMPANY_BANK ?? '',
    registrationNumber: process.env.INVOICE_REGISTRATION_NUMBER ?? '',
  }
}
