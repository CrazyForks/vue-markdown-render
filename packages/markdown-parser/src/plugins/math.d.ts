import type { MathOptions } from '../config';
import type { MarkdownIt } from '../markdown-it-types';

export declare const KATEX_COMMANDS: string[];
export declare const ESCAPED_KATEX_COMMANDS: string;
export declare const ESCAPED_MKATWX_COMMANDS: RegExp;

export declare const TOLERANT_BOUNDARY_SYNTHETIC_PARAGRAPH_META: '__markstreamTolerantBoundarySyntheticParagraph';
export declare const TOLERANT_BOUNDARY_STREAM_CACHE_KEY_ENV: '__markstreamTolerantBoundaryStreamCacheKey';

export declare function hasMarkstreamMathPlugin(md: MarkdownIt): boolean;
export declare function normalizeStandaloneBackslashT(s: string, opts?: MathOptions): string;
export declare function applyMath(md: MarkdownIt, mathOpts?: MathOptions): void;

export declare function getCompletedTolerantMathBlockBoundaryCacheKey(markdown: string): string | null;
export declare function getActiveTolerantMathBlockBoundaryCacheKey(markdown: string): string | null;
export declare function hasClosedTolerantMathBlockBoundaryCandidate(markdown: string): boolean;
export declare function mayContainPendingTolerantMathBlockBoundaryCandidate(markdown: string): boolean;
export declare function isLikelyTolerantAngleBracketMathLine(line: string): boolean;
