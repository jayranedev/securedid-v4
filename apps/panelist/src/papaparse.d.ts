declare module "papaparse" {
  interface ParseConfig<T = unknown> {
    header?: boolean;
    skipEmptyLines?: boolean;
    complete?: (results: { data: T[]; errors: { message: string }[] }) => void;
    error?: (err: Error) => void;
    [key: string]: unknown;
  }
  interface Papa {
    parse<T = unknown>(source: string | File, config?: ParseConfig<T>): void;
  }
  const papa: Papa;
  export default papa;
}
