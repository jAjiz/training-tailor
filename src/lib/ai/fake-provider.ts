import { parseStructured, type GenerateStructuredArgs, type LlmProvider } from "./provider";

const SEQUENCE = Symbol("sequence");
type Sequence = { [SEQUENCE]: unknown[] };

/** Script one value per call, in order, for a schema name. */
export function sequence(...values: unknown[]): unknown {
  return { [SEQUENCE]: values } satisfies Sequence;
}

function isSequence(value: unknown): value is Sequence {
  return typeof value === "object" && value !== null && SEQUENCE in value;
}

/** Test double: maps schemaName → scripted value (validated against the schema) or Error (thrown). */
export class FakeProvider implements LlmProvider {
  readonly model = "fake";
  readonly calls: GenerateStructuredArgs<unknown>[] = [];
  private readonly queues = new Map<string, unknown[]>();

  constructor(private readonly scripts: Record<string, unknown>) {}

  async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T> {
    this.calls.push(args as GenerateStructuredArgs<unknown>);
    if (!(args.schemaName in this.scripts)) {
      throw new Error(`FakeProvider: no scripted response for "${args.schemaName}"`);
    }
    let value = this.scripts[args.schemaName];
    if (isSequence(value)) {
      const queue = this.queues.get(args.schemaName) ?? [...value[SEQUENCE]];
      this.queues.set(args.schemaName, queue);
      if (queue.length === 0) throw new Error(`FakeProvider: sequence for "${args.schemaName}" exhausted`);
      value = queue.shift();
    }
    if (value instanceof Error) throw value;
    return parseStructured(args.schema, value, "FakeProvider");
  }
}
