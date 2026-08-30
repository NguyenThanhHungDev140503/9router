const SKILL_MENTION_REGEX = /\$([a-zA-Z0-9_-]+)/g;
const SERVER_MENTION_REGEX = /@([a-zA-Z0-9_-]+)/g;

export function matchExplicitMentions(prompt, { skills = [], servers = [] } = {}) {
  const matchedSkills = [];
  const matchedServers = [];

  if (typeof prompt !== "string" || !prompt) {
    return { skills: matchedSkills, servers: matchedServers };
  }

  // Check $skill mentions
  const skillMatches = [...prompt.matchAll(SKILL_MENTION_REGEX)].map((m) => m[1].toLocaleLowerCase());
  if (skillMatches.length > 0) {
    for (const skill of skills) {
      const name = skill?.name?.toLocaleLowerCase();
      if (name && skillMatches.includes(name)) {
        matchedSkills.push(skill);
      }
    }
  }

  // Check @server mentions
  const serverMatches = [...prompt.matchAll(SERVER_MENTION_REGEX)].map((m) => m[1].toLocaleLowerCase());
  if (serverMatches.length > 0) {
    for (const server of servers) {
      const id = server?.id?.toLocaleLowerCase();
      const name = server?.name?.toLocaleLowerCase();
      if ((id && serverMatches.includes(id)) || (name && serverMatches.includes(name))) {
        matchedServers.push(server);
      }
    }
  }

  return { skills: matchedSkills, servers: matchedServers };
}
