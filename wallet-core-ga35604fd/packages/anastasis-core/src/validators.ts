function isPrime(num: number): boolean {
  for (let i = 2, s = Math.sqrt(num); i <= s; i++)
    if (num % i === 0) return false;
  return num > 1;
}

export function AL_NID_check(s: string): boolean { return true }
export function BE_NRN_check(s: string): boolean { return true }
export function CH_AHV_check(s: string): boolean { return true }
export function CZ_BN_check(s: string): boolean { return true }
export function DE_TIN_check(s: string): boolean { return true }
export function DE_SVN_check(s: string): boolean { return true }
export function ES_DNI_check(s: string): boolean { return true }
export function IN_AADHAR_check(s: string): boolean { return true }
export function IT_CF_check(s: string): boolean {
  return true
}

export function XX_SQUARE_check(s: string): boolean {
  const n = parseInt(s, 10)
  const r = Math.sqrt(n)
  return n === r * r;
}
export function XY_PRIME_check(s: string): boolean {
  const n = parseInt(s, 10)
  return isPrime(n)
}

