/** Errors the pipeline raises for unusable input. Kept apart so every pipeline module can throw them. */

export class DataValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Source data is invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'DataValidationError';
  }
}
