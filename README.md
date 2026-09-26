# Voice News Live

Local demo of a voice-powered AI news app built on **official OpenAI GPT-Live WebRTC** (`client.live.create`), not the older Realtime ephemeral `/v1/realtime` path.

Speak a topic. The live voice model delegates research to a Responses backend with hosted `web_search`, then calls a custom `present_news_results` function so the UI can render grounded article cards before summarizing aloud.

## Requirements

- Node.js **20+** (OpenAI docs recommend **22.6+** for the Live SDK examples; this project sets `engines.node` to `>=20`)
- An OpenAI project API key with **GPT-Live** access
- A browser with microphone permission (localhost is fine)

## Setup

```bash
cd voice-news-live
npm install
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...
npm start
```

Open [http://localhost:3000](http://localhost:3000), press **Start**, allow the microphone, and ask for news.

Dev mode (restart on file changes):

```bash
npm run dev
```


## Deploy on Vercel

This repo also deploys as:

- Static UI from `public/`
- Serverless `POST /api/session` (`api/session.js`) that calls `client.live.create` with your project `OPENAI_API_KEY`

### One-time env

In the Vercel project **voice-news-live** set:

| Variable | Notes |
| --- | --- |
| `OPENAI_API_KEY` | Encrypted / sensitive. Required for Live sessions. |
| `RESPONSES_MODEL` | Optional. Default `gpt-5.6-terra`. |

Production URL: https://voice-news-live.vercel.app

Local `npm start` still works for offline iteration.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | _(required)_ | Server-side key for `client.live.create` |
| `RESPONSES_MODEL` | `gpt-5.6-terra` | Backend Responses model used under Live delegation (matches the [WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc) example) |
| `PORT` | `3000` | Local HTTP port (`127.0.0.1` only) |

## Model caveats

- **GPT-Live access required.** Session creation uses `session.model: "gpt-live-1"`. Without Live access, `/api/session` fails.
- **Responses model may need updating per project.** The WebRTC docs example uses `gpt-5.6-terra`. The [delegation guide](https://developers.openai.com/api/docs/guides/live-delegation) also mentions alternatives such as `gpt-6-luna` / `gpt-6-sol`. Set `RESPONSES_MODEL` to whatever your project supports.
- The `openai` npm package (Live API from **7.14.0+**) currently declares `engines.node: ">=22"`. If install or runtime fails on Node 20, upgrade with nvm:

  ```bash
  nvm install 22
  nvm use 22
  npm install
  npm start
  ```

## Security

- `OPENAI_API_KEY` never leaves the server. The browser only posts an SDP offer to `/api/session`.
- Origin is checked against `http://localhost:PORT` (same pattern as the official WebRTC quickstart). This is a **local-only demo**. Add real auth, rate limits, and HTTPS before exposing the endpoint.

## Architecture

```
Browser                         Local Express                     OpenAI
-------                         -------------                     ------
getUserMedia + RTCPeerConnection
createDataChannel("oai-events")
ICE gather complete
POST { sdp } -----------------> POST /api/session
                                client.live.create({
                                  session: {
                                    model: "gpt-live-1",
                                    delegation: {
                                      type: "responses",
                                      responses: {
                                        model: RESPONSES_MODEL,
                                        tools: [web_search, present_news_results]
                                      }
                                    }
                                  },
                                  transport: { type: "webrtc", sdp }
                                }) -----------------------------> Live session
<---- 201 { session.id, transport.sdp }
setRemoteDescription(answer)
wait for session.started  <-------------------------------------- data channel
(no session.start)

On nested response.output_item.done for present_news_results:
  render cards → response.item.create (function_call_output)
               → response.create

End: session.close → wait for session.closed → cleanup
```

### UI

- Voice controls + status chip: `idle` | `listening` | `thinking` | `researching` | `speaking`
- Live transcript from `session.input_transcript.delta` / `session.output_transcript.delta`
- Research banner on `session.delegation.*`, commentary/thinking appends, and nested Responses lifecycle
- Scrollable news cards: headline, summary, source, optional date, clickable URL
- Errors for mic denial, network failure, API/session errors, and empty research results

## Docs

- [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc)
- [Getting started with GPT-Live](https://developers.openai.com/api/docs/guides/live)
- [Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation)

## Author

Scott Reed ([smreed32](https://github.com/smreed32))
