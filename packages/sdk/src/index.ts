export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
/** JSON Schema draft-07, validated by the host. Remote references are forbidden. */
export type Schema = {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: Json[];
  default?: Json;
  [key: string]: unknown;
};
export type Contract = { id: string; version: string; schema: Schema };
export type Dependency = {
  id: string;
  version: string;
  url?: string;
  sha256?: string;
};
export type Manifest = {
  format: 2;
  sdk: "^0.1.0";
  id: string;
  version: string;
  kind: "scenario" | "connection";
  name: string;
  description: string;
  author: string;
  entry: "index.mjs";
  /** Optional package artwork, rendered only as an isolated image. */
  icon?: "assets/icon.svg";
  /** Preserve artwork colors by default; theme uses its alpha silhouette. */
  iconColor?: "original" | "theme";
  settings: Schema;
  secrets?: Schema;
  permissions: {
    internet?: boolean;
    local?: { address: string; port: number }[];
  };
  dependencies?: Dependency[];
  /** Canonical definitions accepted by inputs; producers embed definitions in provides. */
  contracts?: Contract[];
  provides?: Record<string, Contract>;
  inputs?: Record<
    string,
    {
      contract: string;
      version: string;
      multiple?: boolean;
      optional?: boolean;
    }
  >;
};
export type Snapshot = {
  connectionId: string;
  contract: string;
  version: string;
  updatedAt: number;
  data: Json;
};
export type MigrationInput = {
  fromVersion: string;
  settings: Json;
  state: Json;
};
export type MigrationResult = { settings: Json; state: Json };
export type Migrator = (
  input: MigrationInput,
) => MigrationResult | Promise<MigrationResult>;
