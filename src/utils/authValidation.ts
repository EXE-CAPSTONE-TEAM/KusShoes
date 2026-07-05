// Client-side mirror of the backend auth validation rules.
// The backend remains the source of truth (uniqueness, race conditions, timing-safe login);
// this module only catches obvious mistakes early and renders field-level messages.
import { ApiError } from '../api/client';

const EMAIL_MAX_LENGTH = 254;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_FORMAT = /^[A-Za-z_][A-Za-z0-9_]{2,29}$/;
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

export type RegisterFields = {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  fullName: string;
};

export type RegisterFieldErrors = Partial<Record<keyof RegisterFields, string>>;

export type LoginFields = {
  email: string;
  password: string;
};

export type LoginFieldErrors = Partial<Record<keyof LoginFields, string>>;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeUsername(raw: string): string {
  return raw.trim();
}

// Trims edges and collapses consecutive plain spaces; tabs/newlines are rejected
// separately by validateFullName rather than silently folded into a space.
export function normalizeFullName(raw: string): string {
  return raw.trim().replace(/ {2,}/g, ' ');
}

export function validateEmail(rawEmail: string): string | null {
  const email = normalizeEmail(rawEmail);
  if (!email) return 'Email is required.';
  if (email.length > EMAIL_MAX_LENGTH) return `Email must be at most ${EMAIL_MAX_LENGTH} characters.`;
  if (!EMAIL_FORMAT.test(email)) return 'Enter a valid email address.';
  return null;
}

export function validateUsername(rawUsername: string): string | null {
  const username = normalizeUsername(rawUsername);
  if (!username) return 'Username is required.';
  if (username.length < 3 || username.length > 30) return 'Username must be 3-30 characters.';
  if (!USERNAME_FORMAT.test(username)) {
    return 'Username must start with a letter or underscore and contain only letters, numbers, and underscores.';
  }
  return null;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

// Password is never trimmed/normalized - whitespace is significant.
export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (utf8ByteLength(password) > 72) return 'Password is too long.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  return null;
}

export function validateConfirmPassword(password: string, confirmPassword: string): string | null {
  if (!confirmPassword) return 'Please confirm your password.';
  if (confirmPassword !== password) return 'Passwords do not match.';
  return null;
}

export function validateFullName(rawFullName: string): string | null {
  if (!rawFullName.trim()) return 'Full name is required.';
  if (CONTROL_CHARS.test(rawFullName)) return 'Full name contains invalid characters.';
  const fullName = normalizeFullName(rawFullName);
  if (fullName.length < 2 || fullName.length > 100) return 'Full name must be 2-100 characters.';
  return null;
}

export function validateRegisterForm(fields: RegisterFields): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};

  const emailError = validateEmail(fields.email);
  if (emailError) errors.email = emailError;

  const usernameError = validateUsername(fields.username);
  if (usernameError) errors.username = usernameError;

  const passwordError = validatePassword(fields.password);
  if (passwordError) errors.password = passwordError;

  const confirmError = validateConfirmPassword(fields.password, fields.confirmPassword);
  if (confirmError) errors.confirmPassword = confirmError;

  const fullNameError = validateFullName(fields.fullName);
  if (fullNameError) errors.fullName = fullNameError;

  return errors;
}

export function validateLoginForm(fields: LoginFields): LoginFieldErrors {
  const errors: LoginFieldErrors = {};

  const emailError = validateEmail(fields.email);
  if (emailError) errors.email = emailError;

  if (!fields.password) errors.password = 'Password is required.';

  return errors;
}

const API_FIELD_TO_REGISTER_FIELD: Record<string, keyof RegisterFields> = {
  email: 'email',
  username: 'username',
  password: 'password',
  confirm_password: 'confirmPassword',
  full_name: 'fullName',
};

export type AuthErrorResult = {
  field?: keyof RegisterFields;
  message: string;
};

// Maps backend error codes / 422 validation payloads to a field-level error
// (when possible) plus a display message. Never echoes password values back.
export function describeAuthApiError(error: ApiError): AuthErrorResult {
  switch (error.code) {
    case 'AUTH_EMAIL_TAKEN':
      return { field: 'email', message: 'This email is already registered.' };
    case 'AUTH_USERNAME_TAKEN':
      return { field: 'username', message: 'This username is already taken.' };
    case 'AUTH_INVALID_CREDENTIALS':
      return { message: 'Email hoặc mật khẩu không đúng' };
    case 'AUTH_ACCOUNT_BANNED':
      return { message: 'Your account has been suspended.' };
    case 'AUTH_GOOGLE_ONLY':
      return { message: 'This account only supports signing in with Google.' };
    default:
      break;
  }

  if (error.status === 422) {
    const detail = error.data.detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { loc?: unknown[]; msg?: string };
      const locField = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : undefined;
      const field = locField ? API_FIELD_TO_REGISTER_FIELD[locField] : undefined;
      return { field, message: first.msg ?? error.message };
    }
  }

  return { message: error.message };
}
