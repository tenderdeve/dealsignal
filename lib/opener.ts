import { chat } from "./groq";
import type { Row } from "./jobs";

const SYSTEM = `You write the opening of a short, respectful letter from an independent searcher
(one person looking to buy and personally run a single small business) to its owner.
Rules:
- Start with "Hi <owner first name>," (or "Hi there," if the owner is unknown), then 3 sentences, then "[Your Name]".
- Sentence 1: one specific, genuine observation built on exactly ONE of the provided facts.
- Sentence 2: who you are: an individual (not a private-equity firm or broker) hoping to own and run one great local <industry> business long-term, keeping the team and the name.
- Sentence 3: ask for a short, no-pressure call about the company's future.
- Use ONLY the facts listed. Never invent anything else: no years in business, reviews, reputation, awards, size or history that is not in the list.
- If the only fact is the location, build the observation on the location alone.
- Never guess the owner's age, health or retirement plans. Never mention price or "selling".
- No hype, no clichés like "I hope this finds you well".`;

export function facts(r: Row): string[] {
  const s = r.signals;
  const f: string[] = [];
  const founded = s?.foundedYear?.value ?? r.lead.yearFounded;
  if (founded) f.push(`In business since ${founded}`);
  if (s?.familyOwned) f.push("Describes itself as family/owner-operated");
  if (s?.services) f.push(`Services: ${s.services}`);
  if (r.lead.city) f.push(`Based in ${r.lead.city}${r.lead.state ? `, ${r.lead.state}` : ""}`);
  return f;
}

// Claims an opener must not make without evidence: history needs a known
// founding year; reviews/awards/reputation are never verified, so never allowed.
const HISTORY = /\b(decades?|\d+\s*\+?\s*years?|since \d{4}|generations?)\b/i;
const SOCIAL = /\b(reviews?|rated|ratings?|awards?|award-winning|reputation)\b/i;

export const unbacked = (draft: string, r: Row) =>
  SOCIAL.test(draft) || (HISTORY.test(draft) && !r.signals?.foundedYear && !r.lead.yearFounded);

export async function writeOpener(r: Row) {
  const f = facts(r);
  const user = [
    `Company: ${r.lead.company}`,
    `Owner: ${r.signals?.owner?.value.name ?? "unknown (address as 'Hi there')"}`,
    `Industry: ${r.lead.industry ?? "unknown"}`,
    `Verified facts:\n- ${f.join("\n- ") || "none"}`,
  ].join("\n");
  // Reject a draft that claims more than the facts support; try twice more.
  for (let i = 0; i < 3; i++) {
    const draft = await chat(SYSTEM, user, { maxTokens: 700 });
    if (!draft) return null;
    if (!unbacked(draft, r)) return draft;
  }
  return null;
}
