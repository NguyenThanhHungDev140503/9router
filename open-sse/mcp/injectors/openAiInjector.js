import { BaseFormatInjector } from "./baseFormatInjector.js";

export class OpenAiInjector extends BaseFormatInjector {
  formatTool({ name, description, parameters }) {
    return {
      type: "function",
      function: {
        name,
        description,
        parameters,
      },
    };
  }
}
