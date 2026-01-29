declare module '@aztec/bb.js' {
  export class Fr {
    constructor(value: bigint | string | number);
    toString(): string;
  }

  export class BarretenbergSync {
    static initSingleton(): Promise<BarretenbergSync>;
    pedersenHash(inputs: Fr[], index: number): Fr;
  }

  export class Barretenberg {
    static new(options?: { threads?: number }): Promise<Barretenberg>;
    destroy?(): Promise<void>;
  }

  export class UltraHonkBackend {
    constructor(bytecode: string, api: Barretenberg);
    generateProof(witness: Uint8Array): Promise<{ proof: Uint8Array; publicInputs: string[] }>;
    verifyProof(proofData: { proof: Uint8Array; publicInputs: string[] }): Promise<boolean>;
    destroy?(): Promise<void>;
    getVerificationKey?(): Promise<Uint8Array>;
  }
}

declare module '@noir-lang/noir_js' {
  export class Noir {
    constructor(circuit: any);
    execute(inputs: any): Promise<{ witness: Uint8Array }>;
  }
}
