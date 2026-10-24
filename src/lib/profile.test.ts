import { describe, expect, it, jest } from '@jest/globals';

import { cleanName, fullName } from '@/lib/profile';

jest.mock('@/lib/supabase', () => ({ supabase: null }));

describe('names', () => {
  it('needs a first name; the last name is optional', () => {
    expect(cleanName('  Jasmine ', ' King ')).toEqual({ first_name: 'Jasmine', last_name: 'King' });
    expect(cleanName('Jasmine', '')).toEqual({ first_name: 'Jasmine', last_name: '' });
    expect(cleanName('   ', 'King')).toBeNull();
    expect(cleanName('x'.repeat(61), '')).toBeNull();
    expect(cleanName('Jo', 'x'.repeat(61))).toBeNull();
  });

  it('joins the parts that exist', () => {
    expect(fullName({ first_name: 'Marcus', last_name: 'Reed' })).toBe('Marcus Reed');
    expect(fullName({ first_name: 'Priya', last_name: null })).toBe('Priya');
    expect(fullName(null)).toBe('');
  });
});
