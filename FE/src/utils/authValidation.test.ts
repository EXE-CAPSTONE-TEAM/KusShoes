import { describe, expect, it } from 'vitest';

import {
  normalizeEmail,
  normalizeFullName,
  validateLoginForm,
  validateRegisterForm,
} from './authValidation';

describe('auth validation', () => {
  it('normalizes email and full name input', () => {
    expect(normalizeEmail('  USER@Example.COM  ')).toBe('user@example.com');
    expect(normalizeFullName('  Duy   Nguyen  ')).toBe('Duy Nguyen');
  });

  it('accepts a valid registration form', () => {
    expect(
      validateRegisterForm({
        email: 'duy@example.com',
        username: 'duy_nguyen',
        password: 'Password1',
        confirmPassword: 'Password1',
        fullName: 'Duy Nguyen',
      }),
    ).toEqual({});
  });

  it('returns field-level errors for invalid registration data', () => {
    const errors = validateRegisterForm({
      email: 'not-email',
      username: '1',
      password: 'weak',
      confirmPassword: 'different',
      fullName: '\n',
    });

    expect(errors.email).toBeDefined();
    expect(errors.username).toBeDefined();
    expect(errors.password).toBeDefined();
    expect(errors.confirmPassword).toBeDefined();
    expect(errors.fullName).toBeDefined();
  });

  it('validates login required fields', () => {
    expect(validateLoginForm({ email: '', password: '' })).toEqual({
      email: 'Email is required.',
      password: 'Password is required.',
    });
  });
});
