import { immutableRecord } from "./immutable.js";
import type {
  FramesOptions,
  FramesRelationship,
  PopulationDefinition,
  RegionDefinition,
} from "./types.js";

export function frames(
  source: PopulationDefinition,
  target: RegionDefinition,
  options?: FramesOptions,
): FramesRelationship {
  if (options === undefined) {
    return immutableRecord<FramesRelationship>("frames", { source, target });
  }

  return immutableRecord<FramesRelationship>("frames", { source, target, options });
}
