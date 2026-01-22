export class ExpectedError extends Error {
  isExpected = true;
  code?: string;
  originalError?: any;

  constructor(message: string, code?: string, originalError?: any) {
    super(message);
    this.name = 'ExpectedError';
    this.code = code;
    this.originalError = originalError;
  }
}
