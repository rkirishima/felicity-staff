'use server'

export async function verifyAdminPin(pin: string): Promise<boolean> {
  return pin === process.env.ADMIN_PIN
}
