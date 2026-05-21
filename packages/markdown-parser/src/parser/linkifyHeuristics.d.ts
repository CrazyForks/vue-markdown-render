export interface LinkifyDemotionContext {
    filename?: boolean;
    marketTicker?: boolean;
}
export declare function isDecodedFromRawPunycode(linkText: string, href: string, raw?: string): boolean;
export declare function inferLinkifyDemotionContext(contextText?: string): LinkifyDemotionContext;
export declare function shouldDemoteFilenameLikeLinkify(linkText: string, context?: LinkifyDemotionContext): boolean;
