import { BaseFormatInjector } from "./baseFormatInjector.js";

export class GeminiInjector extends BaseFormatInjector {
  formatTool({ name, description, parameters }) {
    return {
      functionDeclarations: [{
        name,
        description,
        parameters,
      }],
    };
  }
}
