import { describe, expect, it } from "vitest";
import { crc32, storedZip } from "./zip";

describe("storedZip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes entries a zip reader can find", async () => {
    const files = [
      { name: "frame_0001.png", data: new Uint8Array([1, 2, 3]) },
      { name: "frame_0002.png", data: new Uint8Array([4, 5]) },
    ];
    const bytes = new Uint8Array(await storedZip(files).arrayBuffer());
    const view = new DataView(bytes.buffer);
    // End of central directory: two entries, and the central directory where it says.
    const eocd = bytes.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    const cdOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);
    // Second local header holds the second file's bytes right after its name.
    const second = view.getUint32(cdOffset + 46 + 14 + 42, true);
    expect(new TextDecoder().decode(bytes.subarray(second + 30, second + 44))).toBe("frame_0002.png");
    expect([...bytes.subarray(second + 44, second + 46)]).toEqual([4, 5]);
  });
});
