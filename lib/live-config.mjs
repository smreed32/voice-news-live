/**
 * Shared GPT-Live session config for local Express and Vercel /api/session.
 * Docs: https://developers.openai.com/api/docs/guides/voice-webrtc
 *       https://developers.openai.com/api/docs/guides/live-delegation
 */

export const LIVE_INSTRUCTIONS = [
  "You are Mommy's Little Helper, a warm spoken companion for Courtney, a gift from Gary the dog and Tucker the cat.",
  "Address her as Courtney. Greet her briefly as Mommy's Little Helper, then invite her to ask anything: news, questions, or whatever is on her mind.",
  "When she asks for news, headlines, podcast episodes, websites, links, sources, or anything that needs current facts or a place she can open later,",
  "delegate to the backend Responses agent (which can search the web and present clickable link cards in the UI).",
  "After research results return, summarize a few key points aloud, mention that the links are in her card list, and invite follow-ups.",
  "For ordinary questions that do not need search, answer helpfully in a calm, clear voice.",
  "Do not invent headlines, URLs, or sources. Prefer short, clear speech.",
].join(" ");

export const RESPONSES_INSTRUCTIONS = [
  "You are the research backend for Mommy's Little Helper, a voice companion for Courtney.",
  "When she asks for news, podcasts, websites, links, episodes, sources, or anything she may want to open later:",
  "1) Use the web_search tool to find grounded, real results.",
  "2) Call present_link_cards with 1 to 8 items drawn only from search results.",
  "   Each item needs title, summary, source (publisher/show/site name), url, and kind.",
  "   kind must be one of: article, podcast, website, video, other.",
  "   Include published_at when available. Never invent or guess URLs.",
  "3) After the UI acknowledges present_link_cards, produce a short spoken-ready summary",
  "   with source attribution for the live voice model, and note that she can tap the cards to open them.",
  "If search returns nothing useful, call present_link_cards with an empty items array",
  "and explain that no reliable results were found.",
  "Prefer reputable sources. Keep summaries factual and compact.",
].join(" ");

export const PRESENT_LINK_CARDS_TOOL = {
  type: "function",
  name: "present_link_cards",
  description:
    "Render clickable link cards in the client UI for news articles, podcast episodes, websites, videos, or other looked-up sources. Call after web_search with 1 to 8 real items (or an empty array if none).",
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Grounded links from web search only.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Headline, episode title, or page title.",
            },
            summary: {
              type: "string",
              description: "One or two sentence factual summary.",
            },
            source: {
              type: "string",
              description: "Publisher, podcast show, or site name.",
            },
            url: {
              type: "string",
              description: "Canonical HTTPS URL from search results. Never invent.",
            },
            kind: {
              type: "string",
              description: "What this link is.",
              enum: ["article", "podcast", "website", "video", "other"],
            },
            published_at: {
              type: "string",
              description: "Publication date or datetime if known (optional).",
            },
          },
          required: ["title", "summary", "source", "url", "kind"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
};

/** @deprecated kept only so older client builds still match if needed */
export const PRESENT_NEWS_TOOL = PRESENT_LINK_CARDS_TOOL;

export function responsesModel() {
  return process.env.RESPONSES_MODEL || "gpt-5.6-terra";
}

export function buildLiveCreateBody(sdp) {
  return {
    session: {
      model: "gpt-live-1",
      instructions: LIVE_INSTRUCTIONS,
      delegation: {
        type: "responses",
        responses: {
          model: responsesModel(),
          instructions: RESPONSES_INSTRUCTIONS,
          tools: [{ type: "web_search" }, PRESENT_LINK_CARDS_TOOL],
          tool_choice: "auto",
        },
      },
    },
    transport: {
      type: "webrtc",
      sdp,
    },
  };
}

/** Allow local demo hosts and this project's Vercel deployments. */
export function isAllowedOrigin(originHeader, hostHeader) {
  const port = Number(process.env.PORT) || 3000;
  const local = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://[::1]:${port}`,
  ]);

  if (!originHeader) {
    const host = String(hostHeader || "");
    if (
      host === `localhost:${port}` ||
      host === `127.0.0.1:${port}` ||
      host === `[::1]:${port}`
    ) {
      return true;
    }
    // Same-origin on Vercel often still sends Origin; if missing, allow known hosts.
    if (
      host === "voice-news-live.vercel.app" ||
      host.endsWith(".vercel.app")
    ) {
      return true;
    }
    return false;
  }

  if (local.has(originHeader)) return true;
  try {
    const u = new URL(originHeader);
    if (u.protocol !== "https:") return false;
    if (u.hostname === "voice-news-live.vercel.app") return true;
    if (u.hostname.endsWith(".vercel.app") && u.hostname.includes("voice-news-live")) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
