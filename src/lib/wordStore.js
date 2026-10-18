const STORAGE_KEY = 'lexitrack.words.v1'

function parseFlag(value) {
  if (typeof value === 'boolean') return value
  return ['true', '1', 'yes'].includes(String(value || '').trim().toLowerCase())
}

export function createWord(input) {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    word: String(input.word || '').trim(),
    partOfSpeech: input.partOfSpeech || '',
    category: input.category || 'general',
    definition: String(input.definition || '').trim(),
    example: String(input.example || '').trim(),
    note: input.note?.trim() || '',
    liked: false,
    dateAdded: now,
    mastered: false,
    reviewCount: 0,
  }
}

export function normalizeWord(input) {
  if (!input || typeof input !== 'object') return null

  const word = String(input.word || '').trim()
  const definition = String(input.definition || '').trim()
  if (!word || !definition) return null

  return {
    id: String(input.id || crypto.randomUUID()),
    word,
    partOfSpeech: String(input.partOfSpeech || input.part_of_speech || '').trim(),
    category: String(input.category || 'general').trim().toLowerCase(),
    definition,
    example: String(input.example || input.exampleSentence || '').trim(),
    note: String(input.note || '').trim(),
    liked: parseFlag(input.liked),
    dateAdded: input.dateAdded || input.date_added || new Date().toISOString(),
    mastered: parseFlag(input.mastered),
    reviewCount: Number.isFinite(Number(input.reviewCount)) ? Number(input.reviewCount) : 0,
  }
}

export function readWordsResult() {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY)
    if (serialized === null) return { words: [], error: '' }
    const stored = JSON.parse(serialized)
    if (!Array.isArray(stored)) {
      return { words: [], error: 'Saved vocabulary has an invalid format. Import a backup to restore it.' }
    }
    return { words: stored.map(normalizeWord).filter(Boolean), error: '' }
  } catch (error) {
    const message = error instanceof SyntaxError
      ? 'Saved vocabulary could not be read. Import a backup or clear the damaged local data in Settings.'
      : 'Browser storage is unavailable. Your changes may not persist in this browser.'
    return { words: [], error: message }
  }
}

export function readWords() {
  return readWordsResult().words
}

export function saveWords(words) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(words))
}