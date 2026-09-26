/**
 * Voice News Live - local demo server
 *
 * Creates GPT-Live WebRTC sessions via the official OpenAI Node SDK
 * (`client.live.create`). Keep OPENAI_API_KEY on this server only.
 *
 * Docs:
 *   https://developers.openai.com/api/docs/guides/voice-webrtc
 *   https://developers.openai.com/api/docs/guides/live-delegation
 */
import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

const port = Number(process.env.PORT) || 3000;
const allowedOrigins = new Set([
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  `http://[::1]:${port}`,
]);
const responsesModel = process.env.RESPONSES_MODEL || "gpt-5.6-terra";

const LIVE_INSTRUCTIONS = [
  "You are a concise spoken news assistant.",
  "Greet briefly, then help the user explore current news by topic, region, or outlet.",
  "When the user asks for news, headlines, or anything that needs current facts,",
  "delegate to the backend Responses agent (which can search the web and present article cards).",
  "After research results return, summarize a few key points aloud and invite follow-ups.",
  "Do not invent headlines, URLs, or sources. Prefer short, clear speech.",
].join(" ");

const RESPONSES_INSTRUCTIONS = [
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

const PRESENT_NEWS_TOOL = {
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
            headline: {
              type: "string",
              description: "Article headline.",
            },
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

app.use(express.json({ limit: "64kb" }));
app.use(express.static(join(__dirname, "public")));

// Local-only demo. Add authentication and authorization before exposing
// session creation beyond localhost.
function isAllowedLocalOrigin(request) {
  const incoming = request.headers.origin;
  if (!incoming) {
    // Same-origin navigations sometimes omit Origin; trust Host for local demo.
    const host = String(request.headers.host || "");
    return (
      host === `localhost:${port}` ||
      host === `127.0.0.1:${port}` ||
      host === `[::1]:${port}`
    );
  }
  return allowedOrigins.has(incoming);
}

app.post("/api/session", async (request, response) => {
  if (!isAllowedLocalOrigin(request)) {
    response.status(403).json({
      error: "Unexpected request origin",
      hint: `Open http://localhost:${port} (or http://127.0.0.1:${port})`,
    });
    return;
  }
  if (typeof request.body?.sdp !== "string" || !request.body.sdp.trim()) {
    response.status(400).json({ error: "An SDP offer is required" });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    response.status(503).json({ error: "Set OPENAI_API_KEY on the server" });
    return;
  }

  // Construct only when a key is present so the server can boot without .env.
  const client = new OpenAI({ maxRetries: 0 });

  try {
    // Live session creation: POST /v1/live/sessions via client.live.create
    // https://developers.openai.com/api/docs/guides/voice-webrtc
    // Delegation config: Responses backend + web_search + app function tool
    // https://developers.openai.com/api/docs/guides/live-delegation
    const result = await client.live.create({
      session: {
        model: "gpt-live-1",
        instructions: LIVE_INSTRUCTIONS,
        delegation: {
          type: "responses",
          responses: {
            model: responsesModel,
            instructions: RESPONSES_INSTRUCTIONS,
            tools: [{ type: "web_search" }, PRESENT_NEWS_TOOL],
            tool_choice: "auto",
          },
        },
      },
      transport: {
        type: "webrtc",
        sdp: request.body.sdp,
      },
    });

    // Preserve the SDK's typed session ID and SDP answer unchanged.
    response.status(201).json(result);
  } catch (error) {
    if (!(error instanceof OpenAI.APIError)) {
      console.error("Unexpected session error", error);
      response.status(500).json({ error: "Live session creation failed" });
      return;
    }
    console.error("Live session creation failed", error.status, error.message);
    response
      .status(error.status ?? 502)
      .json({ error: "Live session creation failed" });
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Voice News Live listening at ${origin}`);
  console.log(`Responses model: ${responsesModel}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY is not set. POST /api/session will return 503.");
  }
});
