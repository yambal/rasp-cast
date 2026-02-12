/**
 * ICY (SHOUTcast) メタデータプロトコル
 *
 * - クライアントが `Icy-MetaData: 1` ヘッダーを送った場合のみ使用
 * - サーバーは `icy-metaint` で指定したバイト間隔ごとにメタデータブロックを挿入
 * - メタデータブロック: [1バイト: 長さ/16] + [16バイト境界パディング済み文字列]
 * - メタデータがない場合は 0x00 の1バイトのみ
 */
declare const ICY_METAINT = 8192;
export { ICY_METAINT };
export declare function createIcyMetadataBlock(title: string): Buffer;
/**
 * ICY メタデータをオーディオデータに挿入するトランスフォーマー
 *
 * オーディオデータを ICY_METAINT バイトごとに区切り、
 * その間にメタデータブロックを挿入する。
 */
export declare class IcyInterleaver {
    private bytesSinceLastMeta;
    private currentMetadata;
    constructor(initialTitle?: string);
    updateTitle(title: string): void;
    /**
     * オーディオ chunk を受け取り、ICY メタデータを挿入した Buffer を返す
     */
    process(audioChunk: Buffer): Buffer;
}
