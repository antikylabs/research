import type {
  Definition,
  DslValue,
  FramesRelationship,
  Meters,
  NumericRange,
  PopulationDefinition,
  ProjectProfile,
  ReferenceImage,
  RegionDefinition,
  SceneDefinition,
  ThingDefinition,
} from "./types.js";

function hasOwnDataKind(value: unknown, kind: string): value is object {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const descriptor = Object.getOwnPropertyDescriptor(value, "kind");
  return descriptor !== undefined && "value" in descriptor && descriptor.value === kind;
}

export function isSceneDefinition(value: unknown): value is SceneDefinition {
  return hasOwnDataKind(value, "scene");
}

export function isThingDefinition(value: unknown): value is ThingDefinition {
  return hasOwnDataKind(value, "thing");
}

export function isRegionDefinition(value: unknown): value is RegionDefinition {
  return hasOwnDataKind(value, "region");
}

export function isPopulationDefinition(value: unknown): value is PopulationDefinition {
  return hasOwnDataKind(value, "population");
}

export function isDefinition(value: unknown): value is Definition {
  return (
    isSceneDefinition(value) ||
    isThingDefinition(value) ||
    isRegionDefinition(value) ||
    isPopulationDefinition(value)
  );
}

export function isReferenceImage(value: unknown): value is ReferenceImage {
  return hasOwnDataKind(value, "reference-image");
}

export function isNumericRange(value: unknown): value is NumericRange {
  return hasOwnDataKind(value, "range");
}

export function isMeters(value: unknown): value is Meters {
  return hasOwnDataKind(value, "meters");
}

export function isFramesRelationship(value: unknown): value is FramesRelationship {
  return hasOwnDataKind(value, "frames");
}

export function isProjectProfile(value: unknown): value is ProjectProfile {
  return hasOwnDataKind(value, "project-profile");
}

function isDeeplyFrozenData(
  value: unknown,
  active = new WeakSet<object>(),
  completed = new WeakSet<object>(),
): boolean {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object" || !Object.isFrozen(value)) {
    return false;
  }
  if (completed.has(value)) {
    return true;
  }
  if (active.has(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }

  active.add(value);
  const keys = Array.isArray(value)
    ? Array.from({ length: value.length }, (_unused, index) => String(index))
    : Object.getOwnPropertyNames(value);
  if (Array.isArray(value)
    && (keys.some((key) => !Object.hasOwn(value, key))
      || Object.keys(value).some((key) => !keys.includes(key)))) {
    active.delete(value);
    return false;
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable
      || !isDeeplyFrozenData(descriptor.value, active, completed)) {
      active.delete(value);
      return false;
    }
  }
  active.delete(value);
  completed.add(value);
  return true;
}

/**
 * Built DSL values are immutable leaves while another declaration is cloned.
 * This structural policy preserves direct-reference identity without a registry.
 */
export function isPreservableDslValue(value: unknown): value is DslValue {
  return (
    isDeeplyFrozenData(value) &&
    (isDefinition(value) ||
      isReferenceImage(value) ||
      isNumericRange(value) ||
      isMeters(value) ||
      isFramesRelationship(value) ||
      isProjectProfile(value))
  );
}
