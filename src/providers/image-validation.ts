/** Validate provider image bytes before confirming or retaining imagery. */
export function isVerifiedImageBytes(data: Uint8Array, contentType: string): boolean {
  if (/^image\/(?:jpeg|jpg)(?:\s*;|\s*$)/i.test(contentType))
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (/^image\/png(?:\s*;|\s*$)/i.test(contentType))
    return data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e &&
      data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a;
  return false;
}
