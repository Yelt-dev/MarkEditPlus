import { describe, expect, test } from '@jest/globals';
import { normalizePageSetup } from '../src/modules/preview/pageSetup';

describe('Export: page setup normalization', () => {
  test('test an empty setup falls back to A4 portrait', () => {
    expect(normalizePageSetup()).toEqual({ pageSize: 'a4', orientation: 'portrait' });
    expect(normalizePageSetup('', '')).toEqual({ pageSize: 'a4', orientation: 'portrait' });
  });

  test('test page sizes are recognized case-insensitively and in Spanish', () => {
    expect(normalizePageSetup('A4').pageSize).toBe('a4');
    expect(normalizePageSetup('Letter').pageSize).toBe('letter');
    expect(normalizePageSetup('Carta').pageSize).toBe('letter');
    expect(normalizePageSetup('Legal').pageSize).toBe('legal');
    expect(normalizePageSetup('Oficio').pageSize).toBe('legal');
  });

  test('test unknown page size falls back to A4', () => {
    expect(normalizePageSetup('tabloid').pageSize).toBe('a4');
  });

  test('test orientation understands English and Spanish spellings', () => {
    expect(normalizePageSetup('A4', 'horizontal').orientation).toBe('landscape');
    expect(normalizePageSetup('A4', 'landscape').orientation).toBe('landscape');
    expect(normalizePageSetup('A4', 'apaisado').orientation).toBe('landscape');
    expect(normalizePageSetup('A4', 'vertical').orientation).toBe('portrait');
    expect(normalizePageSetup('A4', 'retrato').orientation).toBe('portrait');
  });
});
