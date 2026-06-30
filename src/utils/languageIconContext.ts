import type { InjectionKey } from 'vue'
import type { LanguageIconResolver } from './languageIcon'

export const MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY: InjectionKey<LanguageIconResolver | null> = Symbol('markstreamLanguageIconResolver')
