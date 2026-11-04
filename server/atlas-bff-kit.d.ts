declare module '@onebrief/atlas-bff-kit' {
  export class HttpError extends Error {
    constructor(status: number, message: string);
    status: number;
  }
}
