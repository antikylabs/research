import { immutableRecord } from "./immutable.js";
import type {
  AcceptanceDirection,
  ExperienceDirection,
  PopulationDefinition,
  PopulationInput,
  PlacementDirection,
  RegionDefinition,
  RegionInput,
  RulesDirection,
  SceneDefinition,
  SceneGameplayDirection,
  SceneInput,
  TechnicalOverride,
  ThingDefinition,
  ThingGameplayDirection,
  ThingInput,
  ThingShapeDirection,
  VariationDirection,
  VisualDirection,
} from "./types.js";

type NoExtraKeys<Value, Shape> = {
  readonly [Key in Exclude<keyof Value, keyof Shape>]: never;
};

type StrictProperty<Input, Key extends PropertyKey, Shape> =
  Input extends { readonly [Property in Key]: infer Value }
    ? Value extends Shape
      ? { readonly [Property in Key]: Value & NoExtraKeys<Value, Shape> }
      : never
    : unknown;

type StrictSceneInput<Input extends SceneInput> = Input
  & NoExtraKeys<Input, SceneInput>
  & StrictProperty<Input, "experience", ExperienceDirection>
  & StrictProperty<Input, "visual", VisualDirection>
  & StrictProperty<Input, "gameplay", SceneGameplayDirection>
  & StrictProperty<Input, "rules", RulesDirection>
  & StrictProperty<Input, "acceptance", AcceptanceDirection>;

type StrictThingInput<Input extends ThingInput> = Input
  & NoExtraKeys<Input, ThingInput>
  & StrictProperty<Input, "shape", ThingShapeDirection>
  & StrictProperty<Input, "visual", VisualDirection>
  & StrictProperty<Input, "gameplay", ThingGameplayDirection>
  & StrictProperty<Input, "variation", VariationDirection>
  & StrictProperty<Input, "rules", RulesDirection>
  & StrictProperty<Input, "technical", TechnicalOverride>;

type StrictRegionInput<Input extends RegionInput> = Input
  & NoExtraKeys<Input, RegionInput>
  & StrictProperty<Input, "rules", RulesDirection>
  & StrictProperty<Input, "technical", TechnicalOverride>;

type StrictPopulationInput<Input extends PopulationInput> = Input
  & NoExtraKeys<Input, PopulationInput>
  & StrictProperty<Input, "placement", PlacementDirection>
  & StrictProperty<Input, "variation", VariationDirection>
  & StrictProperty<Input, "rules", RulesDirection>
  & StrictProperty<Input, "technical", TechnicalOverride>;

export function scene<const Input extends SceneInput>(input: StrictSceneInput<Input>): SceneDefinition {
  return immutableRecord<SceneDefinition>("scene", input);
}

export function thing<const Input extends ThingInput>(input: StrictThingInput<Input>): ThingDefinition {
  return immutableRecord<ThingDefinition>("thing", input);
}

export function region<const Input extends RegionInput>(input: StrictRegionInput<Input>): RegionDefinition {
  return immutableRecord<RegionDefinition>("region", input);
}

export function population<const Input extends PopulationInput>(
  input: StrictPopulationInput<Input>,
): PopulationDefinition {
  return immutableRecord<PopulationDefinition>("population", input);
}
