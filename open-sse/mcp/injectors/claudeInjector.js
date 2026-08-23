import { BaseFormatInjector } from "./baseFormatInjector.js";

export class ClaudeInjector extends BaseFormatInjector {
  formatTool({ name, description, parameters }) {
    return {
      name,
      description,
      input_schema: parameters,
    };
  }
}
