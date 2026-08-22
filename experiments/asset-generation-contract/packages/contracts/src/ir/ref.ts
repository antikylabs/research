const CONTRACT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/;

declare const contractReferenceKind: unique symbol;

/** A string contract identifier branded for generated and engine-facing code. */
export type ContractRef<Kind extends string = string> = string & {
  readonly [contractReferenceKind]: Kind;
};

/**
 * Brand an exact contract identifier without changing its runtime representation.
 *
 * The check deliberately matches the supplied technical contract schema so a
 * generated refs module cannot introduce an identifier that the IR rejects.
 */
export function contractRef<Kind extends string = string>(value: string): ContractRef<Kind> {
  if (value.length < 3 || !CONTRACT_ID_PATTERN.test(value)) {
    throw new TypeError(`Invalid contract reference: ${JSON.stringify(value)}`);
  }

  return value as ContractRef<Kind>;
}

export function isContractId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length >= 3 && CONTRACT_ID_PATTERN.test(value)
  );
}
