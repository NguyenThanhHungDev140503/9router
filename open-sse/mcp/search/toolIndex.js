import MiniSearch from "minisearch";
import { MCP_SEARCH_CONFIG } from "../../config/mcpConstants.js";
import { normalizePromptText, tokenizeAndClean } from "./tokenizer.js";

function collectTerms(...sources) {
  const result = [];
  for (const src of sources) {
    if (Array.isArray(src)) {
      for (const item of src) {
        if (typeof item === "string" && item.trim()) {
          result.push(item.trim());
        }
      }
    } else if (typeof src === "string" && src.trim()) {
      result.push(src.trim());
    }
  }
  return result.join(" ");
}

export class ToolIndexManager {
  constructor() {
    this.index = null;
    this.documents = new Map();
  }

  static createSearchEngine() {
    return new MiniSearch({
      fields: ["triggers", "keywords", "name", "description"],
      storeFields: ["id", "type", "serverId", "name"],
      tokenize: (text) => tokenizeAndClean(text),
      searchOptions: {
        boost: MCP_SEARCH_CONFIG.BOOST,
        fuzzy: (term) => (term.length > 4 ? 0.2 : false),
        prefix: false,
        combineWith: "OR",
      },
    });
  }

  buildIndex({ servers = [], toolCache = [], skills = [] } = {}) {
    const engine = ToolIndexManager.createSearchEngine();
    const docs = [];
    const docMap = new Map();

    const serverMap = new Map(
      (Array.isArray(servers) ? servers : [])
        .filter((s) => s?.enabled === true && typeof s?.id === "string")
        .map((s) => [s.id, s])
    );
    const enabledServerIds = new Set(serverMap.keys());

    // Index Tools
    if (Array.isArray(toolCache)) {
      for (const cacheRow of toolCache) {
        if (!enabledServerIds.has(cacheRow?.serverId) || !Array.isArray(cacheRow?.tools)) {
          continue;
        }
        const server = serverMap.get(cacheRow.serverId);

        for (const tool of cacheRow.tools) {
          if (!tool?.name) continue;
          const id = `tool:${cacheRow.serverId}:${tool.name}`;
          const doc = {
            id,
            type: "tool",
            serverId: cacheRow.serverId,
            name: tool.name,
            triggers: collectTerms(tool.triggers, tool.matchRules?.triggers),
            keywords: collectTerms(tool.keywords, tool.matchRules?.keywords),
            description: tool.description || "",
          };
          docs.push(doc);
          docMap.set(id, { ...doc, raw: tool });
        }
      }
    }

    // Index Skills
    if (Array.isArray(skills)) {
      for (const skill of skills) {
        if (skill?.enabled === false || !skill?.name) continue;
        const id = `skill:${skill.id || skill.name}`;
        const doc = {
          id,
          type: "skill",
          name: skill.name,
          triggers: collectTerms(skill.triggers, skill.matchRules?.triggers),
          keywords: collectTerms(skill.keywords, skill.matchRules?.keywords),
          description: skill.description || skill.systemPrompt || "",
        };
        docs.push(doc);
        docMap.set(id, { ...doc, raw: skill });
      }
    }

    if (docs.length > 0) {
      engine.addAll(docs);
    }
    // Atomic swap
    this.index = engine;
    this.documents = docMap;
  }

  search(query, { minScore = MCP_SEARCH_CONFIG.MIN_SCORE_THRESHOLD } = {}) {
    if (!this.index || typeof query !== "string" || !query.trim()) return [];
    const normalized = normalizePromptText(query);
    if (!normalized) return [];

    const searchResults = this.index.search(normalized);
    return searchResults
      .filter((res) => res.score >= minScore)
      .map((res) => {
        const fullDoc = this.documents.get(res.id);
        return {
          ...res,
          ...fullDoc,
        };
      });
  }
}

export const globalToolIndex = new ToolIndexManager();
