export interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: {
    definition: string;
    example?: string;
  }[];
}

export interface DictionaryResult {
  word: string;
  phonetic?: string;
  meanings: DictionaryMeaning[];
  sourceUrl?: string;
}

export async function lookupWord(
  word: string,
): Promise<DictionaryResult | null> {
  try {
    const cleaned = word.toLowerCase().trim().replace(/[^a-z'-]/g, "");
    if (!cleaned || cleaned.length < 2) return null;

    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`,
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const entry = data[0];
    return {
      word: entry.word,
      phonetic: entry.phonetic || entry.phonetics?.[0]?.text,
      meanings: (entry.meanings || []).map(
        (m: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }) => ({
          partOfSpeech: m.partOfSpeech,
          definitions: (m.definitions || []).slice(0, 3).map(
            (d: { definition: string; example?: string }) => ({
              definition: d.definition,
              example: d.example,
            }),
          ),
        }),
      ),
      sourceUrl: entry.sourceUrls?.[0],
    };
  } catch (err) {
    console.error("Dictionary lookup failed:", err);
    return null;
  }
}

export async function lookupWikipedia(word: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word.trim())}?redirect=true`,
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data.extract || null;
  } catch {
    return null;
  }
}
