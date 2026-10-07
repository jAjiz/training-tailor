import { StructuredOutputError, type GenerateStructuredArgs, type LlmProvider } from "./provider";

/** One retry when the output fails schema validation, with the validation error in the prompt. */
export function withValidationRetry(provider: LlmProvider): LlmProvider {
  return {
    model: provider.model,
    async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<T> {
      try {
        return await provider.generateStructured(args);
      } catch (e) {
        if (!(e instanceof StructuredOutputError)) throw e;
        return provider.generateStructured({
          ...args,
          prompt: `${args.prompt}\n\nYour previous response was rejected:\n${e.details}\nReturn JSON that satisfies the schema exactly.`,
        });
      }
    },
  };
}
