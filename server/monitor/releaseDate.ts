const FOUR_DIGIT_YEAR = /\b(?:19|20)\d{2}\b/
const NUMERIC_YEAR_MONTH = /^\d{4}[-/.]\d{1,2}$/
const NUMERIC_MONTH_YEAR = /^\d{1,2}[-/.]\d{4}$/

function normalizeDateText(value: string): string {
  return value
    .replace(/[\uFF10-\uFF19]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u00a0/g, ' ')
    .trim()
}

/**
 * Steam returns localized release strings: some are exact dates, others are
 * years, quarters or "coming soon". CJK dates need a day marker because a
 * month-only value such as 2026年10月 also contains a 1-31 number.
 */
export function isExactReleaseDate(value: string | null | undefined): boolean {
  if (!value) return false
  const text = normalizeDateText(value)
  if (!text) return false
  if (/\bQ[1-4]\b/i.test(text) || /\bH[12]\b/i.test(text)) return false
  if (!FOUR_DIGIT_YEAR.test(text)) return false

  if (/[年月日]|[년월일]/.test(text)) {
    return /\d{1,2}\s*[日일]/.test(text)
  }
  if (NUMERIC_YEAR_MONTH.test(text) || NUMERIC_MONTH_YEAR.test(text)) return false

  const numbers = text.match(/\d+/g) ?? []
  return numbers.some((part) => {
    if (part.length === 4) return false
    const day = Number(part)
    return day >= 1 && day <= 31
  })
}
