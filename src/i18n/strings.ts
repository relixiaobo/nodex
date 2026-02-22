import { enMessages, type EnMessages } from './en.js';

type Primitive = string | number;
type LocaleCode = 'en';

type DotPath<T> = T extends object
  ? {
      [K in keyof T & string]:
        T[K] extends string
          ? K
          : T[K] extends object
            ? `${K}.${DotPath<T[K]>}`
            : never;
    }[keyof T & string]
  : never;

export type TranslationKey = DotPath<EnMessages>;

const catalogs: Record<LocaleCode, EnMessages> = {
  en: enMessages,
};

let currentLocale: LocaleCode = 'en';

export function setLocale(locale: LocaleCode): void {
  currentLocale = locale;
}

export function getLocale(): LocaleCode {
  return currentLocale;
}

function resolveMessage(obj: unknown, key: string): string | null {
  let cursor: unknown = obj;
  for (const part of key.split('.')) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === 'string' ? cursor : null;
}

function interpolate(template: string, params?: Record<string, Primitive>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

export function t(key: TranslationKey, params?: Record<string, Primitive>): string {
  const catalog = catalogs[currentLocale] ?? catalogs.en;
  const msg = resolveMessage(catalog, key) ?? resolveMessage(catalogs.en, key) ?? key;
  return interpolate(msg, params);
}
