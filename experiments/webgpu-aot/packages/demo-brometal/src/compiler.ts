export interface BindingDefinition {
  readonly group: number;
  readonly binding: number;
  readonly declaration: string;
}

export interface FunctionDefinition {
  readonly attributes?: readonly string[];
  readonly signature: string;
  readonly body: string;
}

export interface ShaderDefinition {
  readonly declarations?: readonly string[];
  readonly bindings: readonly BindingDefinition[];
  readonly functions: readonly FunctionDefinition[];
}

function assertUniqueBindings(bindings: readonly BindingDefinition[]): void {
  const occupied = new Set<string>();
  for (const binding of bindings) {
    const key = `${binding.group}:${binding.binding}`;
    if (occupied.has(key)) {
      throw new Error(`Duplicate BroMetal binding ${key}`);
    }
    occupied.add(key);
  }
}

export function compileShader(definition: ShaderDefinition): string {
  assertUniqueBindings(definition.bindings);
  const bindings = [...definition.bindings]
    .sort(
      (left, right) =>
        left.group - right.group || left.binding - right.binding,
    )
    .map(
      (binding) =>
        `@group(${binding.group}) @binding(${binding.binding}) ${binding.declaration};`,
    );
  const functions = definition.functions.map((fn) => {
    const attributes = fn.attributes?.join("\n") ?? "";
    const prefix = attributes.length > 0 ? `${attributes}\n` : "";
    return `${prefix}fn ${fn.signature} {\n${fn.body.trim()}\n}`;
  });
  const declarations = (definition.declarations ?? []).map((source) =>
    source.trim(),
  );
  return `${[...declarations, ...bindings, ...functions].join("\n\n")}\n`;
}
