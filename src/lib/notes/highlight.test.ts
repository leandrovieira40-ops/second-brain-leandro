import { describe, expect, it } from 'vitest';
import { splitHighlights } from './highlight';

describe('splitHighlights', () => {
  it('separa os termos destacados', () => {
    expect(splitHighlights('o \u0002posicionamento\u0003 da \u0002marca\u0003.')).toEqual([
      { text: 'o ', mark: false },
      { text: 'posicionamento', mark: true },
      { text: ' da ', mark: false },
      { text: 'marca', mark: true },
      { text: '.', mark: false },
    ]);
  });

  it('trata HTML como texto e ignora marcadores soltos e outros controles', () => {
    expect(splitHighlights('<img src=x onerror=alert(1)>\u0003 fim\u0007')).toEqual([
      { text: '<img src=x onerror=alert(1)>', mark: false },
      { text: ' fim', mark: false },
    ]);
    expect(splitHighlights('')).toEqual([]);
  });
});
