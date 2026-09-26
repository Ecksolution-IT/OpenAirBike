/** Little-endian cursor over a characteristic value (FTMS §3.2: LSO first). */
export class ByteReader {
  private offset = 0;
  private readonly view: DataView;

  constructor(source: DataView | ArrayBufferView | ArrayBuffer) {
    if (source instanceof DataView) {
      this.view = source;
    } else if (ArrayBuffer.isView(source)) {
      this.view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    } else {
      this.view = new DataView(source);
    }
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  has(bytes: number): boolean {
    return this.remaining >= bytes;
  }

  u8(): number {
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  u16(): number {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  s16(): number {
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  u24(): number {
    const v = this.view.getUint16(this.offset, true) | (this.view.getUint8(this.offset + 2) << 16);
    this.offset += 3;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  utf8(): string {
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, this.remaining);
    this.offset = this.view.byteLength;
    return new TextDecoder().decode(bytes);
  }
}

/** Little-endian byte builder, used by the simulator and tests to produce FTMS payloads. */
export class ByteWriter {
  private readonly bytes: number[] = [];

  u8(v: number): this {
    this.bytes.push(v & 0xff);
    return this;
  }

  u16(v: number): this {
    return this.u8(v).u8(v >> 8);
  }

  s16(v: number): this {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }

  u24(v: number): this {
    return this.u8(v).u8(v >> 8).u8(v >> 16);
  }

  u32(v: number): this {
    return this.u16(v & 0xffff).u16(v >>> 16);
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export function toHex(bytes: DataView | Uint8Array): string {
  const arr = bytes instanceof DataView ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes;
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-f]/gi, '');
  if (clean.length % 2 !== 0) throw new Error(`Odd-length hex string: ${hex}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
