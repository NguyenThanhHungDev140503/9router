import { BaseFormatInjector } from "./baseFormatInjector.js";

export class ResponsesInjector extends BaseFormatInjector {
  formatTool({ name, description, parameters }) {
    return {
      type: "function",
      name,
      description,
      parameters,
    };
  }
}
