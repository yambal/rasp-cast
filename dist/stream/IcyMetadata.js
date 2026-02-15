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
/**
 * FMOD 互換のためタイトル文字列をサニタイズ
 * - 制御文字、非 ASCII 文字を除去（FMOD クラッシュ防止）
 * - シングルクォートを除去（ICY プロトコル区切り文字）
 * - 128 文字に制限
 */
function sanitizeTitle(title) {
    return title
        .replace(/'/g, '') // シングルクォート除去
        .replace(/[\x00-\x1F]/g, '') // 制御文字除去
        .replace(/[^\x20-\x7E]/g, '') // 非 ASCII 除去
        .slice(0, 128);
}
export function createIcyMetadataBlock(title) {
    if (!title) {
        // メタデータなし: 長さ0の1バイト
        return Buffer.alloc(1, 0);
    }
    const safe = sanitizeTitle(title);
    const text = `StreamTitle='${safe}';`;
    const textBytes = Buffer.from(text, 'ascii');
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
    bytesSinceLastMeta = 0;
    currentMetadata;
    constructor(initialTitle = '') {
        this.currentMetadata = createIcyMetadataBlock(initialTitle);
    }
    updateTitle(title) {
        this.currentMetadata = createIcyMetadataBlock(title);
    }
    /**
     * オーディオ chunk を受け取り、ICY メタデータを挿入した Buffer を返す
     */
    process(audioChunk) {
        const output = [];
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
