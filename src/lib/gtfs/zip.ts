import { inflateRawSync } from 'zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

/**
 * Extract one entry from an in-memory zip archive using only Node's zlib.
 *
 * Sizes are read from the central directory rather than the local header, so
 * entries written with a trailing data descriptor (sizes 0 in the local
 * header) extract correctly. Stored (0) and deflate (8) are supported; zip64
 * is rejected with a clear error rather than misread.
 */
export function extractZipEntry(zip: Buffer, entryName: string): Buffer {
  const searchFloor = Math.max(0, zip.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = zip.length - 22; i >= searchFloor; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip archive: end of central directory not found');

  const entryCount = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || offset === 0xffffffff) {
    throw new Error('Zip64 archives are not supported');
  }

  for (let n = 0; n < entryCount; n++) {
    if (zip.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error('Corrupt zip central directory');
    }
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeader = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (name === entryName) {
      if (zip.readUInt32LE(localHeader) !== LOCAL_HEADER_SIGNATURE) {
        throw new Error(`Corrupt local header for ${entryName}`);
      }
      const dataStart =
        localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
      const data = zip.subarray(dataStart, dataStart + compressedSize);

      let out: Buffer;
      if (method === 0) out = Buffer.from(data);
      else if (method === 8) out = inflateRawSync(data);
      else throw new Error(`Unsupported zip compression method ${method} for ${entryName}`);

      if (out.length !== uncompressedSize) {
        throw new Error(`Size mismatch extracting ${entryName}: ${out.length} != ${uncompressedSize}`);
      }
      return out;
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`${entryName} not found in zip archive`);
}
