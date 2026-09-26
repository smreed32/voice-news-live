/**
 * Shared GPT-Live session config for local Express and Vercel /api/session.
 * Docs: https://developers.openai.com/api/docs/guides/voice-webrtc
 *       https://developers.openai.com/api/docs/guides/live-delegation
 */

export const LIVE_INSTRUCTIONS = [
  "You are Mommy's Little Helper, a warm spoken companion for Courtney, a gift from Gary the dog and Tucker the cat.",
  "Address her as Courtney. Greet her briefly as Mommy's Little Helper, then invite her to ask anything: news, questions, or whatever is on her mind.",
  "When she asks for news, headlines, or anything that needs current facts,",
  "delegate to the backend Responses agent (which can search the web and present article cards).",
  "After research results return, summarize a few key points aloud and invite follow-ups.",
  "For ordinary questions that do not need search, answer helpfully in a calm, clear voice.",
  "Do not invent headlines, URLs, or sources. Prefer short, clear speech.",
].join(" ");

export const RESPONSES_INSTRUCTIONS = [
  "You are the research backend for a voice news assistant.",
  "When asked for news or current events:",
  "1) Use the web_search tool to find grounded, recent coverage.",
  "2) Call present_news_results with 3 to 8 articles drawn only from search results.",
  "   Each article needs headline, summary, source (publisher name), and a real url.",
  "   Include published_at when available. Never invent or guess URLs.",
  "3) After the UI acknowledges present_news_results, produce a short spoken-ready summary",
  "   with source attribution (publisher names) for the live voice model.",
  "If search returns nothing useful, call present_news_results with an empty articles array",
  "and explain that no reliable results were found.",
  "Prefer reputable publishers. Keep summaries factual and compact.",
].join(" ");

export const PRESENT_NEWS_TOOL = {
  type: "function",
  name: "present_news_results",
  description:
    "Render grounded news article cards in the client UI. Call after web_search with 3 to 8 real articles (or an empty array if none).",
  parameters: {
    type: "object",
    properties: {
      articles: {
        type: "array",
        description: "Grounded news articles from web search only.",
        items: {
          type: "object",
          properties: {
            headline: { type: "string", description: "Article headline." },
            summary: {
              type: "string",
              description: "One or two sentence factual summary.",
            },
            source: {
              type: "string",
              description: "Publisher or outlet name.",
            },
            url: {
              type: "string",
              description: "Canonical article URL from search results. Never invent.",
            },
            published_at: {
              type: "string",
              description: "Publication date or datetime if known (optional).",
            },
          },
          required: ["headline", "summary", "source", "url"],
          additionalProperties: false,
        },
      },
    },
    required: ["articles"],
    additionalProperties: false,
  },
};

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
          tools: [{ type: "web_search" }, PRESENT_NEWS_TOOL],
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
