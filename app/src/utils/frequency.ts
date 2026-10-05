const DAY = 86_400

/** On-chain `frequency` codes. Devnet builds of the program also accept code 3. */
const FREQUENCIES = {
  0: { name: 'weekly', periodSeconds: 7 * DAY },
  1: { name: 'biweekly', periodSeconds: 14 * DAY },
  2: { name: 'monthly', periodSeconds: 30 * DAY },
  3: { name: 'fiveMinutes', periodSeconds: 300 },
} as const

type Frequency = (typeof FREQUENCIES)[keyof typeof FREQUENCIES]
export type FrequencyName = Frequency['name']

export function frequencyFromCode(code: number): Frequency | undefined {
  return (FREQUENCIES as Record<number, Frequency>)[code]
}
