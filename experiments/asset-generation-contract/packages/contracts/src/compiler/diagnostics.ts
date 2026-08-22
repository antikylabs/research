export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface DiagnosticLocation {
  readonly semanticPath?: string;
  readonly technicalPath?: string;
  readonly contractId?: string;
  readonly message?: string;
}

export interface Diagnostic extends Omit<DiagnosticLocation, 'message'> {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly hint?: string;
  readonly related?: readonly DiagnosticLocation[];
}

export const diagnosticCodes = {
  accessor: 'DSL_SERIALIZATION_ACCESSOR',
  arrayHole: 'DSL_SERIALIZATION_ARRAY_HOLE',
  arrayProperty: 'DSL_SERIALIZATION_ARRAY_PROPERTY',
  bigint: 'DSL_SERIALIZATION_BIGINT',
  cycle: 'DSL_SERIALIZATION_CYCLE',
  function: 'DSL_SERIALIZATION_FUNCTION',
  inspection: 'DSL_SERIALIZATION_INSPECTION',
  nonEnumerable: 'DSL_SERIALIZATION_NON_ENUMERABLE',
  nonFiniteNumber: 'DSL_SERIALIZATION_NON_FINITE_NUMBER',
  symbol: 'DSL_SERIALIZATION_SYMBOL',
  undefined: 'DSL_SERIALIZATION_UNDEFINED',
  unsupportedPrototype: 'DSL_SERIALIZATION_UNSUPPORTED_PROTOTYPE',
  bindingKind: 'DSL_BINDING_KIND',
  bindingRecord: 'DSL_BINDING_RECORD',
  duplicateBinding: 'DSL_DUPLICATE_BINDING',
  idCollision: 'DSL_ID_COLLISION',
  invalidKey: 'DSL_INVALID_SCOPED_KEY',
  referenceKind: 'DSL_REFERENCE_KIND',
  referenceOutsideScene: 'DSL_REFERENCE_OUTSIDE_SCENE',
  referenceUnbound: 'DSL_REFERENCE_UNBOUND',
  relationshipIdCollision: 'DSL_RELATIONSHIP_ID_COLLISION',
  unreachable: 'DSL_DECLARATION_UNREACHABLE',
  definitionCycle: 'DSL_DEFINITION_DEPENDENCY_CYCLE',
  profileConflict: 'DSL_PROFILE_CONFLICT',
  profileContentMismatch: 'DSL_PROFILE_CONTENT_MISMATCH',
  profileDirectionConflict: 'DSL_PROFILE_DIRECTION_CONFLICT',
  profileDuplicate: 'DSL_PROFILE_DUPLICATE',
  profileInvalid: 'DSL_PROFILE_INVALID',
  profileUnsupported: 'DSL_PROFILE_UNSUPPORTED',
  semanticShape: 'DSL_INVALID_SEMANTIC_SHAPE',
  rangeInvalid: 'DSL_RANGE_INVALID',
  unitInvalid: 'DSL_UNIT_INVALID',
} as const;

export type KnownDiagnosticCode = (typeof diagnosticCodes)[keyof typeof diagnosticCodes];

/** Locale-independent UTF-16 code-unit order used by deterministic compiler records. */
export function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createDiagnostic(diagnostic: Diagnostic): Diagnostic {
  const related = diagnostic.related?.map((location) => ({
    ...(location.semanticPath === undefined ? {} : { semanticPath: location.semanticPath }),
    ...(location.technicalPath === undefined ? {} : { technicalPath: location.technicalPath }),
    ...(location.contractId === undefined ? {} : { contractId: location.contractId }),
    ...(location.message === undefined ? {} : { message: location.message }),
  })).sort(compareDiagnosticLocations);
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.semanticPath === undefined ? {} : { semanticPath: diagnostic.semanticPath }),
    ...(diagnostic.technicalPath === undefined ? {} : { technicalPath: diagnostic.technicalPath }),
    ...(diagnostic.contractId === undefined ? {} : { contractId: diagnostic.contractId }),
    ...(diagnostic.hint === undefined ? {} : { hint: diagnostic.hint }),
    ...(related === undefined ? {} : { related }),
  };
}

function compareOptional(left: string | undefined, right: string | undefined): number {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return compareStableText(left, right);
}

export function compareDiagnosticLocations(left: DiagnosticLocation, right: DiagnosticLocation): number {
  return compareOptional(left.semanticPath, right.semanticPath)
    || compareOptional(left.technicalPath, right.technicalPath)
    || compareOptional(left.contractId, right.contractId)
    || compareOptional(left.message, right.message);
}

const severityOrder: Readonly<Record<DiagnosticSeverity, number>> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return severityOrder[left.severity] - severityOrder[right.severity]
    || compareOptional(left.semanticPath, right.semanticPath)
    || compareOptional(left.technicalPath, right.technicalPath)
    || compareOptional(left.contractId, right.contractId)
    || compareOptional(left.code, right.code)
    || compareOptional(left.message, right.message)
    || compareOptional(left.hint, right.hint)
    || compareOptional(JSON.stringify(left.related ?? []), JSON.stringify(right.related ?? []));
}

/** Return a new, deterministically ordered list without hiding repeated failures. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return diagnostics.map(createDiagnostic).sort(compareDiagnostics);
}

export function hasBlockingDiagnostics(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(({ severity }) => severity === 'error');
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const path = diagnostic.semanticPath ?? diagnostic.technicalPath ?? diagnostic.contractId;
  return `${diagnostic.code}${path === undefined ? '' : ` at ${path}`}: ${diagnostic.message}`;
}
