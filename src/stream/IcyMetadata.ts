/**
 * ICY (SHOUTcast) メタデータプロトコル
 *
 * - クライアントが `Icy-MetaData: 1` ヘッダーを送った場合のみ使用
 * - サーバーは `icy-metaint` で指定したバイト間隔ごとにメタデータブロックを挿入
 * - メタデータブロック: [1バイト: 長さ/16] + [16バイト境界パディング済み文字列]
 * - メタデータがない場合は 0x00 の1バイトのみ
 */

const ICY_METAINT = 8192;

export { ICY_METAINT };

export function createIcyMetadataBlock(title: string): Buffer {
  if (!title) {
    // メタデータなし: 長さ0の1バイト
    return Buffer.alloc(1, 0);
  }

  const text = `StreamTitle='${title}';`;
  const textBytes = Buffer.from(text, 'utf-8');
  const paddedLength = Math.ceil(textBytes.length / 16) * 16;
  const block = Buffer.alloc(1 + paddedLength, 0);
  block[0] = paddedLength / 16;
  textBytes.copy(block, 1);
  return block;
}

/**
 * ICY メタデータをオーディオデータに挿入するトランスフォーマー
 *
 * オーディオデータを ICY_METAINT バイトごとに区切り、
 * その間にメタデータブロックを挿入する。
 */
export class IcyInterleaver {
  private bytesSinceLastMeta = 0;
  private currentMetadata: Buffer;

  constructor(initialTitle: string = '') {
    this.currentMetadata = createIcyMetadataBlock(initialTitle);
  }

  updateTitle(title: string): void {
    this.currentMetadata = createIcyMetadataBlock(title);
  }

  /**
   * オーディオ chunk を受け取り、ICY メタデータを挿入した Buffer を返す
   */
  process(audioChunk: Buffer): Buffer {
    const output: Buffer[] = [];
    let offset = 0;

    while (offset < audioChunk.length) {
      const remaining = ICY_METAINT - this.bytesSinceLastMeta;
      const bytesToWrite = Math.min(remaining, audioChunk.length - offset);

      output.push(audioChunk.subarray(offset, offset + bytesToWrite));
      this.bytesSinceLastMeta += bytesToWrite;
      offset += bytesToWrite;

      if (this.bytesSinceLastMeta >= ICY_METAINT) {
        output.push(this.currentMetadata);
        this.bytesSinceLastMeta = 0;
      }
    }

    return Buffer.concat(output);
  }
}
