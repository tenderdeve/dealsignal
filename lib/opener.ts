import { chat } from "./groq";
import type { Row } from "./jobs";

const SYSTEM = `You write the opening of a short, respectful letter from an independent searcher
(one person looking to buy and personally run a single small business) to its owner.
Rules:
- Start with "Hi <owner first name>," (or "Hi there," if the owner is unknown), then 3 sentences, then "[Your Name]".
- Sentence 1: one specific, genuine observation built on exactly ONE of the provided facts.
- Sentence 2: who you are: an individual (not a private-equity firm or broker) hoping to own and run one great local <industry> business long-term, keeping the team and the name.
- Sentence 3: ask for a short, no-pressure call about the company's future.
- Never guess the owner's age, health or retirement plans. Never mention price or "selling".
- No hype, no clichés like "I hope this finds you well".`;

export function facts(r: Row): string[] {
  const s = r.signals;
  const f: string[] = [];
  if (s?.foundedYear) f.push(`In business since ${s.foundedYear.value}`);
  if (s?.familyOwned) f.push("Describes itself as family/owner-operated");
  if (s?.services) f.push(`Services: ${s.services}`);
  if (r.lead.city) f.push(`Based in ${r.lead.city}${r.lead.state ? `, ${r.lead.state}` : ""}`);
  return f;
}

export async function writeOpener(r: Row) {
  const f = facts(r);
  const user = [
    `Company: ${r.lead.company}`,
    `Owner: ${r.signals?.owner?.value.name ?? "unknown (address as 'Hi there')"}`,
    `Industry: ${r.lead.industry ?? "unknown"}`,
    `Verified facts:\n- ${f.join("\n- ") || "none"}`,
  ].join("\n");
  return chat(SYSTEM, user, { maxTokens: 700 });
}
