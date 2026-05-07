import type { MarkdownIt } from 'markdown-it-ts';
import type { MarkdownToken } from '../types';
export declare function applyFixTableTokens(md: MarkdownIt): void;
export declare function fixTableTokens(tokens: MarkdownToken[]): MarkdownToken[];
