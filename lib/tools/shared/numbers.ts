/** Number normalisation shared by tools that compare amounts, periods and clause numbers. */
const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/** Latin digits, no thousands separators, Arabic decimal comma as a dot. */
export function normalizeNumbers(text: string): string {
  return text
    .replace(EASTERN_DIGITS, (d) => String((d.charCodeAt(0) - (d >= "۰" ? 0x06f0 : 0x0660)) % 10))
    .replace(/(\d)٫(\d)/g, "$1.$2")
    .replace(/(\d)[,٬'  ](?=\d{3}(?!\d))/g, "$1");
}

const WORD_UNITS: Record<string, number> = {
  واحد: 1, واحدة: 1, احد: 1, أحد: 1, احدى: 1, إحدى: 1, اثنان: 2, اثنين: 2, اثنتان: 2, اثنتين: 2, ثلاث: 3, ثلاثة: 3, اربع: 4, أربع: 4, اربعة: 4, أربعة: 4,
  خمس: 5, خمسة: 5, ست: 6, ستة: 6, سبع: 7, سبعة: 7, ثمان: 8, ثماني: 8, ثمانية: 8, تسع: 9, تسعة: 9,
};
const WORD_TENS: Record<string, number> = {
  عشر: 10, عشرة: 10, عشرون: 20, عشرين: 20, ثلاثون: 30, ثلاثين: 30, اربعون: 40, أربعون: 40, اربعين: 40, أربعين: 40, خمسون: 50, خمسين: 50,
  ستون: 60, ستين: 60, سبعون: 70, سبعين: 70, ثمانون: 80, ثمانين: 80, تسعون: 90, تسعين: 90,
};
const WORD_HUNDREDS: Record<string, number> = { مائة: 100, مئة: 100, مائتين: 200, مائتان: 200, مئتين: 200, مئتان: 200 };
const DUALS = /(?<![\p{L}])(يومين|يومان|شهرين|شهران|اسبوعين|أسبوعين|سنتين|سنتان|عامين|عامان|ساعتين|ساعتان)(?![\p{L}])/gu;
const DUAL_UNIT: Record<string, string> = { يوم: "يوم", شهر: "شهر", اسبوع: "اسبوع", أسبوع: "أسبوع", سنت: "سنة", عام: "عام", ساعت: "ساعة" };

/**
 * Rewrites Arabic cardinal number words ("خمسة عشر", "ثلاثين", "مائة وعشرين")
 * and dual forms ("يومين") as digits, so periods and amounts written in words
 * compare like numbers. Text without number words is returned unchanged.
 */
export function arabicNumberWordsToDigits(text: string): string {
  const withDuals = text.replace(DUALS, (word) => {
    const stem = Object.keys(DUAL_UNIT).find((key) => word.startsWith(key));
    return stem ? `2 ${DUAL_UNIT[stem]}` : word;
  });
  const words = Object.keys({ ...WORD_UNITS, ...WORD_TENS, ...WORD_HUNDREDS }).sort((a, b) => b.length - a.length).join("|");
  const phrase = new RegExp(`(?<![\\p{L}])(?:و?(?:${words}))(?:\\s+و?(?:${words}))*(?![\\p{L}])`, "gu");
  return withDuals.replace(phrase, (match) => {
    let total = 0;
    let teens = false;
    for (const raw of match.split(/\s+/)) {
      const word = raw.startsWith("و") && !(raw in WORD_UNITS) && !(raw in WORD_TENS) ? raw.slice(1) : raw;
      if (word in WORD_HUNDREDS) total += WORD_HUNDREDS[word];
      else if ((word === "عشر" || word === "عشرة") && total > 0 && total < 10 && !teens) {
        total += 10;
        teens = true;
      } else if (word in WORD_TENS) total += WORD_TENS[word];
      else if (word in WORD_UNITS) total += WORD_UNITS[word];
    }
    return total > 0 ? String(total) : match;
  });
}
