export interface RegisterHighlightOptions {
    themes?: string[];
    langs?: string[];
}
export interface ShikiRendererOptions {
    theme?: string;
    themes?: string[];
    langs?: string[];
}
export type RegisterHighlightFn = (opts?: RegisterHighlightOptions) => Promise<unknown> | unknown;
type SharedHighlightRegistrationStatus = 'ready';
export declare function getLanguageBaseToken(rawLang?: string | null): string;
export declare function normalizeShikiLanguage(rawLang?: string | null): string;
export declare function getShikiLanguageMatchKey(rawLang?: string | null): string;
export declare function getShikiLangs(langs?: readonly string[]): string[] | undefined;
export declare function getShikiThemes(themes?: readonly unknown[]): string[] | undefined;
export declare function getShikiRendererOptions(themes?: readonly unknown[], langs?: readonly string[]): Pick<ShikiRendererOptions, 'themes' | 'langs'>;
export declare function getRegisterHighlightOptions(themes?: readonly unknown[], langs?: readonly string[]): RegisterHighlightOptions;
export declare function getHighlightRegistrationKey(themes?: readonly unknown[], langs?: readonly string[]): string;
export declare function createRegisteredHighlightLanguages(langs?: readonly string[]): Set<string> | undefined;
export declare function registerHighlightOnce(registerHighlight: RegisterHighlightFn | undefined, opts: RegisterHighlightOptions, key?: string): Promise<SharedHighlightRegistrationStatus>;
export {};
