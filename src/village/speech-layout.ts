/** Quebra falas do canvas sem deixar uma palavra longa escapar pelo balão. */
export function wrapSpeech(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const limit = Math.max(1, maxWidth);
  const lines: string[] = [];
  let current = '';

  const pushCurrent = (): void => {
    if (current) lines.push(current);
    current = '';
  };
  const appendWord = (word: string): void => {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= limit) {
      current = candidate;
      return;
    }
    pushCurrent();
    if (measure(word) <= limit) {
      current = word;
      return;
    }
    let chunk = '';
    for (const char of word) {
      const next = chunk + char;
      if (chunk && measure(next) > limit) {
        lines.push(chunk);
        chunk = char;
      } else chunk = next;
    }
    current = chunk;
  };

  for (const paragraph of text.split('\n')) {
    for (const word of paragraph.split(/\s+/).filter(Boolean)) appendWord(word);
    pushCurrent();
  }
  return lines.length > 0 ? lines : [''];
}
