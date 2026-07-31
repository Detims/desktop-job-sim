export class PersistenceError extends Error {
  constructor(
    readonly eventCode: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PersistenceError";
  }
}
