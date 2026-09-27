export const dataVolumeBits = (bitrateBps: number, durationSeconds: number): number => bitrateBps * durationSeconds;
export const transmissionTimeSeconds = (bits: number, bitrateBps: number): number => bits / bitrateBps;
export const compressionResultBits = (originalBits: number, compressionRatio: number): number => originalBits / compressionRatio;
export const storageDays = (storageBits: number, generatedBitsPerDay: number): number => storageBits / generatedBitsPerDay;
export function downlinkBalance(generatedBps: number, downlinkBps: number, contactFraction: number): { netBps: number; stable: boolean } { const capacity = downlinkBps * contactFraction; return { netBps: capacity - generatedBps, stable: capacity >= generatedBps }; }
export function dailyDataBudget(instruments: readonly { rateBps: number; dutyCycle: number }[]): number { return instruments.reduce((sum, item) => sum + item.rateBps * item.dutyCycle * 86400, 0); }
