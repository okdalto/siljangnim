// One language for the descriptions the app shows (examples, the reference list):
// the person's choice in Settings, or the system's preferred languages.
export type Language = "en" | "ko";
export type LanguageChoice = "auto" | Language;

/** The first preferred language the app has text for; English otherwise. */
export function systemLanguage(preferred: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]): Language {
  for (const tag of preferred) {
    if (/^ko\b/i.test(tag)) return "ko";
    if (/^en\b/i.test(tag)) return "en";
  }
  return "en";
}

export function resolveLanguage(choice: LanguageChoice | undefined, preferred?: readonly string[]): Language {
  return choice === "en" || choice === "ko" ? choice : systemLanguage(preferred);
}
