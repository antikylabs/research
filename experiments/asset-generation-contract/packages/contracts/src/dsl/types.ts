/** Values that can cross the authoring-to-compiler boundary without execution. */
export type JsonPrimitive = boolean | null | number | string;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonObject = { readonly [key: string]: JsonValue };

export type DeepReadonly<T> = T extends JsonPrimitive
  ? T
  : T extends (...args: never[]) => unknown
    ? never
    : T extends readonly (infer Item)[]
      ? readonly DeepReadonly<Item>[]
      : T extends object
        ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T;

declare const rangeBrand: unique symbol;
declare const metersBrand: unique symbol;

export interface Range<T extends number = number> {
  readonly kind: "range";
  readonly min: T;
  readonly max: T;
  /** Construct with between(); compile-time only, so normalized declarations stay plain JSON. */
  readonly [rangeBrand]: true;
}

export type NumericRange = Range<number>;

export interface Meters {
  readonly kind: "meters";
  readonly value: number | NumericRange;
  /** Construct with meters(); compile-time only, so normalized declarations stay plain JSON. */
  readonly [metersBrand]: true;
}

export interface ReferenceImage {
  readonly kind: "reference-image";
  readonly path: string;
}

export interface ReferenceUse {
  readonly image: ReferenceImage;
  readonly use: string;
}

export interface ExperienceDirection {
  readonly fantasy: string;
  readonly feel?: readonly string[];
  readonly firstRead?: readonly string[];
  readonly closerLook?: readonly string[];
}

export type VisualDensity = "high" | "low" | "medium" | "medium-high" | "very-high";

export interface VisualDirection {
  readonly language: string;
  readonly lighting?: string;
  readonly density?: VisualDensity;
  readonly silhouettes?: string;
  readonly detail?: string;
  readonly avoid?: readonly string[];
}

export interface VariationDirection {
  readonly vary: readonly string[];
  readonly preserve?: readonly string[];
  readonly avoid?: readonly string[];
}

export interface RulesDirection {
  readonly must?: readonly string[];
  readonly avoid?: readonly string[];
}

export interface SceneGameplayDirection {
  readonly playAs?: PopulationDefinition;
  readonly purpose: string;
  readonly loop?: readonly string[];
  readonly playerCan?: readonly string[];
  readonly pace?: string;
  readonly spaceMust?: readonly string[];
}

export interface ThingGameplayDirection {
  readonly playable?: boolean;
  readonly role: string;
  readonly playerCan?: readonly string[];
}

export interface ThingShapeDirection {
  readonly form?: string;
  readonly width?: Meters;
  readonly height?: Meters;
  readonly depth?: Meters;
  readonly length?: Meters;
}

export interface TechnicalOverride {
  readonly components: Readonly<Record<string, JsonObject>>;
}

export interface PopulationCountCheck {
  readonly key: string;
  readonly subject: PopulationDefinition;
  readonly measure: "population count";
  readonly expected: NumericRange;
}

export interface AcceptanceDirection {
  readonly review?: readonly string[];
  readonly checks?: readonly PopulationCountCheck[];
}

export interface PlacementDirection {
  readonly around: RegionDefinition;
  readonly pattern?: "loose clusters";
  readonly spacing?: Meters;
  readonly leave?: readonly string[];
  readonly avoid?: readonly string[];
}

export interface FramesOptions {
  readonly coverage?: string;
  readonly opening?: string;
  readonly avoid?: string;
}

export interface FramesRelationship {
  readonly kind: "frames";
  readonly source: PopulationDefinition;
  readonly target: RegionDefinition;
  readonly options?: FramesOptions;
}

export type SystemPhase =
  | "resolve"
  | "layout"
  | "terrain"
  | "population"
  | "synthesis"
  | "surface"
  | "detail"
  | "composition"
  | "render"
  | "validate"
  | "publish";

export interface ProjectProfileSystem {
  readonly id: string;
  readonly phase: SystemPhase;
  readonly implementation: string;
  readonly implementationVersion: string;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly query: JsonObject;
  readonly dependsOn: readonly string[];
  readonly randomStream?: string;
  readonly parameters?: JsonObject;
  readonly invalidation?: JsonObject;
  readonly produces?: readonly string[];
}

export declare class ProjectProfile {
  private readonly installedProjectProfileBrand: true;
  readonly kind: "project-profile";
  readonly id: "voxel-diorama";
  readonly version: "0.1.0";
  readonly coordinatePolicy: {
    readonly handedness: "right";
    readonly upAxis: "y";
    readonly horizontalAxes: readonly ["x", "z"];
    readonly worldUnit: "meter";
    readonly voxelSizeMeters: number;
    readonly origin: "scene-bounds-center-at-terrain-reference";
  };
  readonly seedPolicy: {
    readonly algorithm: "sha256-hierarchical-v1";
    readonly rootSeed: "derive-from-scene-key";
    readonly streamKeyParts: readonly [
      "root-seed",
      "contract-id",
      "entity-id",
      "system-id",
      "purpose-key",
    ];
  };
  readonly schema: {
    readonly contract: { readonly id: string; readonly version: string };
    readonly catalog: { readonly id: string; readonly uri: string; readonly version: string };
  };
  readonly systems: readonly ProjectProfileSystem[];
  readonly validation: {
    readonly schema: true;
    readonly ownership: true;
    readonly references: true;
    readonly systemDag: true;
    readonly humanReview: "required";
  };
  readonly render: {
    readonly requiredPasses: readonly string[];
  };
  readonly outputs: {
    readonly canonicalJson: true;
    readonly utf8: true;
    readonly lineEndings: "lf";
    readonly finalNewline: true;
    readonly files: readonly [
      "resolved-contract.json",
      "diagnostics.json",
      "contract-index.json",
      "contract.refs.ts",
      "build-manifest.json",
    ];
  };
}

export interface ThingInput {
  readonly name: string;
  readonly basedOn?: ThingDefinition;
  readonly parts?: Readonly<Record<string, ThingDefinition>>;
  readonly references?: readonly ReferenceUse[];
  readonly identity?: readonly string[];
  readonly shape?: ThingShapeDirection;
  readonly visual?: VisualDirection;
  readonly gameplay?: ThingGameplayDirection;
  readonly variation?: VariationDirection;
  readonly rules?: RulesDirection;
  readonly avoid?: readonly string[];
  readonly technical?: TechnicalOverride;
}

export interface ThingDefinition extends ThingInput {
  readonly kind: "thing";
}

export interface RegionInput {
  readonly name: string;
  readonly references?: readonly ReferenceUse[];
  readonly purpose?: readonly string[];
  readonly shape?: string;
  readonly width?: Meters;
  readonly height?: Meters;
  readonly depth?: Meters;
  readonly length?: Meters;
  readonly features?: Readonly<Record<string, ThingDefinition>>;
  readonly keep?: readonly string[];
  readonly avoid?: readonly string[];
  readonly rules?: RulesDirection;
  readonly technical?: TechnicalOverride;
}

export interface RegionDefinition extends RegionInput {
  readonly kind: "region";
}

export interface PopulationInput {
  readonly name: string;
  readonly of: ThingDefinition;
  readonly amount: NumericRange;
  readonly placement?: PlacementDirection;
  readonly references?: readonly ReferenceUse[];
  readonly role?: readonly string[];
  readonly variation?: VariationDirection;
  readonly rules?: RulesDirection;
  readonly technical?: TechnicalOverride;
}

export interface PopulationDefinition extends PopulationInput {
  readonly kind: "population";
}

export type CastDefinition = PopulationDefinition | RegionDefinition;

export interface SceneInput {
  readonly key: string;
  readonly name: string;
  readonly profiles?: readonly ProjectProfile[];
  readonly references?: readonly ReferenceUse[];
  readonly experience?: ExperienceDirection;
  readonly visual?: VisualDirection;
  readonly gameplay?: SceneGameplayDirection;
  readonly definitions?: Readonly<Record<string, ThingDefinition>>;
  readonly cast?: Readonly<Record<string, CastDefinition>>;
  readonly composition?: readonly FramesRelationship[];
  readonly rules?: RulesDirection;
  readonly acceptance?: AcceptanceDirection;
}

export interface SceneDefinition extends SceneInput {
  readonly kind: "scene";
}

export type Definition =
  | PopulationDefinition
  | RegionDefinition
  | SceneDefinition
  | ThingDefinition;

export type DslValue =
  | Definition
  | FramesRelationship
  | Meters
  | NumericRange
  | ProjectProfile
  | ReferenceImage;
