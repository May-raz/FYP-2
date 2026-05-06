"""
Structured English tutor feedback via Groq (JSON-only responses).
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
XAI_URL = os.getenv("XAI_API_URL", "https://api.x.ai/v1/chat/completions")
HF_URL = os.getenv("HF_API_URL", "https://router.huggingface.co/v1/chat/completions")
LLM_TIMEOUT_SEC = float(os.getenv("LLM_TIMEOUT_SEC", "10"))


def _normalize_groq_api_key(raw: Optional[str]) -> str:
    """Strip whitespace and optional surrounding quotes from .env values."""
    if not raw:
        return ""
    key = str(raw).strip().strip('"').strip("'")
    return key


def _groq_failure_reason(status_code: int, response_text: str) -> str:
    """Short, actionable message for logs/UI — avoid dumping full Groq JSON into tutor feedback."""
    text = (response_text or "")[:800].lower()
    if status_code == 401 or "invalid_api_key" in text:
        return (
            "Groq returned 401 invalid API key. In backend/.env set GROQ_API_KEY to a current key "
            "from https://console.groq.com/keys (no spaces or quotes around the value), save the file, "
            "then restart the Flask server."
        )
    if status_code == 403:
        return "Groq denied this request (403). Check the key’s permissions or create a new API key."
    if status_code == 429:
        return "Groq rate limit reached. Wait a minute and try again."
    if "decommissioned" in text or "no longer supported" in text:
        return "Groq model is deprecated. Set GROQ_MODEL=llama-3.1-8b-instant in backend/.env and restart."
    return f"Groq HTTP {status_code}. Check GROQ_API_KEY and network, then try again."


def _normalize_api_key(raw: Optional[str]) -> str:
    return _normalize_groq_api_key(raw)


def _iter_llm_backends() -> List[Dict[str, str]]:
    """Ordered provider chain for resilient tutor feedback generation."""
    backends: List[Dict[str, str]] = []

    groq_primary = _normalize_api_key(os.getenv("GROQ_API_KEY", ""))
    if groq_primary:
        backends.append(
            {
                "name": "groq-primary",
                "url": GROQ_URL,
                "model": os.getenv("GROQ_MODEL", GROQ_MODEL),
                "api_key": groq_primary,
            }
        )

    groq_backup = _normalize_api_key(
        os.getenv("GROQ_API_KEY_BACKUP", "")
        or os.getenv("GROQ_API_KEY_2", "")
        or os.getenv("GROQ_FALLBACK_API_KEY", "")
    )
    if groq_backup and groq_backup != groq_primary:
        backends.append(
            {
                "name": "groq-backup",
                "url": GROQ_URL,
                "model": os.getenv("GROQ_MODEL_BACKUP", GROQ_MODEL),
                "api_key": groq_backup,
            }
        )

    grok_key = _normalize_api_key(os.getenv("GROK_API_KEY", "") or os.getenv("XAI_API_KEY", ""))
    if grok_key:
        backends.append(
            {
                "name": "grok-xai",
                "url": XAI_URL,
                "model": os.getenv("GROK_MODEL", os.getenv("XAI_MODEL", "grok-2-latest")),
                "api_key": grok_key,
            }
        )

    hf_key = _normalize_api_key(os.getenv("HUGGINGFACE_API_KEY", "") or os.getenv("HF_TOKEN", ""))
    if hf_key:
        backends.append(
            {
                "name": "huggingface",
                "url": HF_URL,
                "model": os.getenv("HF_CHAT_MODEL", "meta-llama/Llama-3.1-8B-Instruct"),
                "api_key": hf_key,
            }
        )

    return backends


def _provider_failure_reason(name: str, status_code: int, response_text: str) -> str:
    if "groq" in name:
        return _groq_failure_reason(status_code, response_text)
    if status_code == 401:
        return f"{name} rejected the API key (401). Check the key in backend/.env."
    if status_code == 429:
        return f"{name} rate limit reached. Please retry shortly."
    return f"{name} HTTP {status_code}"

TUTOR_SYSTEM_PROMPT = """You are an English tutor.

Analyze the sentence and return:

1. Corrected sentence
2. Grammar score (0–10)
3. Fluency score (0–10)
4. Pronunciation score (0–10)
5. Short explanation
6. Improved sentence

Tone requirements:
- Sound like a friendly human coach, not a rubric or machine.
- Use natural conversational English and contractions when appropriate.
- Keep "feedback" to at most 2 short sentences.
- Mention exactly one highest-impact fix first, then one encouraging next step.
- Avoid robotic phrasing such as "your sentence demonstrates" or "it is important to note".
- End with normal punctuation.

Return ONLY JSON:
{
  "corrected_sentence": "...",
  "grammar_score": number,
  "fluency_score": number,
  "pronunciation_score": number,
  "feedback": "...",
  "improved_sentence": "..."
}"""


def _parse_json_object(text: str) -> Dict[str, Any]:
    """Extract and parse the first JSON object from model output (handles ```json fences)."""
    if not text or not str(text).strip():
        raise ValueError("empty model output")

    raw = str(text).strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.IGNORECASE)
    if fence:
        raw = fence.group(1).strip()

    decoder = json.JSONDecoder()
    for i, ch in enumerate(raw):
        if ch != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(raw[i:])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    raise ValueError("no JSON object found")


def _clamp_score(val: Any, default: float = 5.0) -> float:
    try:
        x = float(val)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(10.0, x))


def _normalize_feedback_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    g = _clamp_score(data.get("grammar_score"))
    f = _clamp_score(data.get("fluency_score"))
    p = _clamp_score(data.get("pronunciation_score"))
    corrected = (data.get("corrected_sentence") or "").strip()
    improved = (data.get("improved_sentence") or "").strip()
    feedback = (data.get("feedback") or "").strip()
    if not corrected:
        corrected = improved or feedback or "—"
    if not improved:
        improved = corrected
    if not feedback:
        feedback = "Nice work — keep going with short, clear sentences."

    xp = round((g + f + p) * 10, 1)

    return {
        "corrected_sentence": corrected,
        "grammar_score": g,
        "fluency_score": f,
        "pronunciation_score": p,
        "feedback": feedback,
        "improved_sentence": improved,
        "xp_gained": xp,
    }


def _fallback_feedback(user_text: str, reason: str = "") -> Dict[str, Any]:
    text = (user_text or "").strip() or "…"
    fb = (
        "I couldn't run the full AI analysis this time. "
        "Try again in a moment, or shorten your sentence."
    )
    if reason:
        fb = f"{fb} ({reason})"
    return _normalize_feedback_payload(
        {
            "corrected_sentence": text,
            "grammar_score": 5,
            "fluency_score": 5,
            "pronunciation_score": 5,
            "feedback": fb,
            "improved_sentence": text,
        }
    )


def _format_profile_block(user_profile: Optional[Dict[str, Any]]) -> str:
    if not user_profile:
        return ""

    weak = user_profile.get("weak_areas") or []
    if isinstance(weak, str):
        weak = [weak]
    weak_str = ", ".join(str(w) for w in weak if w) or "(none recorded yet)"

    ag = user_profile.get("avg_grammar")
    af = user_profile.get("avg_fluency")
    ap = user_profile.get("avg_pronunciation")
    av_line = "not enough data yet"
    if ag is not None and af is not None and ap is not None:
        av_line = f"grammar {ag}, fluency {af}, pronunciation {ap} (each 0–10)"

    recent: List[str] = user_profile.get("recent_user_messages") or []
    if not recent:
        recent_lines = "(no recent lines)"
    else:
        recent_lines = "\n".join(f"- {line[:200]}" for line in recent[-5:])

    return f"""
Optional learner context (use if helpful; do not invent problems not suggested below):
User struggles with: {weak_str}
Rolling averages (0–10): {av_line}
Recent practice lines:
{recent_lines}
"""


def generate_feedback(user_text: str, user_profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Returns a dict with corrected_sentence, grammar/fluency/pronunciation scores (0–10),
    feedback, improved_sentence, and xp_gained ((g+f+p)*10).
    """
    user_text = (user_text or "").strip()
    if not user_text:
        return _fallback_feedback("", "empty sentence")

    backends = _iter_llm_backends()
    if not backends:
        return _fallback_feedback(
            user_text,
            "No LLM API key found. Add GROQ_API_KEY (and optionally backup keys) to backend/.env.",
        )

    user_block = _format_profile_block(user_profile)
    user_message = f"""Remember: output a single JSON object only. No markdown, no commentary.

{user_block}

Student sentence to analyze:
\"\"\"{user_text}\"\"\"
"""

    payload_base = {
        "messages": [
            {"role": "system", "content": TUTOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_message.strip()},
        ],
        "max_tokens": 220,
        "temperature": 0.45,
        "top_p": 0.9,
    }

    last_reason = "all providers failed"
    for backend in backends:
        headers = {
            "Authorization": f"Bearer {backend['api_key']}",
            "Content-Type": "application/json",
        }
        payload = dict(payload_base)
        payload["model"] = backend["model"]

        try:
            resp = requests.post(backend["url"], headers=headers, json=payload, timeout=LLM_TIMEOUT_SEC)
            if resp.status_code != 200:
                last_reason = _provider_failure_reason(backend["name"], resp.status_code, resp.text or "")
                print(f"ai_tutor {backend['name']} error {resp.status_code}: {(resp.text or '')[:220]}")
                continue

            body = resp.json()
            content = (
                body.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            parsed = _parse_json_object(content)
            return _normalize_feedback_payload(parsed)
        except requests.RequestException as e:
            last_reason = f"{backend['name']} network {e}"
            continue
        except (ValueError, json.JSONDecodeError, KeyError, IndexError) as e:
            last_reason = f"{backend['name']} parse {e}"
            continue

    return _fallback_feedback(user_text, last_reason)


PARTNER_SYSTEM_PROMPT = """You are Emma, a warm English conversation partner (not a classroom teacher).

Rules:
- Reply with at most 2 short sentences unless they clearly ask for more detail.
- Sound human: natural contractions, no bullet lists, no rubric language, no scores.
- Do not mention grammar scores, pronunciation scores, fluency metrics, or "as an AI".
- If they make a small slip, weave a gentle correction into your reply naturally (no lecturing).
- Match their energy; answer questions directly first, then one light follow-up if it fits."""


WRAPUP_SYSTEM_PROMPT = """You summarize an English practice chat for the learner.

Return ONLY valid JSON (no markdown) with this shape:
{"summary":"1-2 warm sentences about how the chat went","improvements":["short tip 1","short tip 2"]}

Rules:
- Encouraging, never harsh; no grades or percentages.
- At most 2 improvement tips; each one short (under 18 words).
- Focus on one or two useful patterns you noticed from their English (not nitpicks)."""


def _shorten_partner_reply(text: str, max_sentences: int = 2) -> str:
    t = (text or "").strip()
    if not t:
        return "I'm here—what's on your mind?"
    parts = re.split(r"(?<=[.!?])\s+", t)
    kept = [p for p in parts if p.strip()][:max_sentences]
    out = " ".join(s.strip() for s in kept).strip()
    if not out:
        out = t[:280].strip()
    return out


def generate_partner_reply(
    user_text: str,
    history_pairs: Optional[List[tuple]] = None,
    persona: str = "beginner",
) -> str:
    """Single lightweight LLM call: short conversational reply (no JSON scoring)."""
    user_text = (user_text or "").strip()
    if not user_text:
        return "Say something when you're ready—I'm listening."

    backends = _iter_llm_backends()
    if not backends:
        return (
            "I'd love to chat, but no AI key is set on the server yet. "
            "Ask your teacher to add GROQ_API_KEY in backend/.env."
        )

    persona = (persona or "beginner").strip().lower()
    ctx_lines: List[str] = []
    for pair in (history_pairs or [])[-8:]:
        if not isinstance(pair, (list, tuple)) or len(pair) < 2:
            continue
        u, a = str(pair[0] or "").strip(), str(pair[1] or "").strip()
        if u:
            ctx_lines.append(f"User: {u}")
        if a:
            ctx_lines.append(f"Emma: {a}")
    ctx_block = "\n".join(ctx_lines) if ctx_lines else "(start of conversation)"

    user_message = f"""Learner persona hint: {persona} (tone only—do not lecture about levels).

Recent turns:
{ctx_block}

User just said:
\"\"\"{user_text}\"\"\"
"""

    payload_base = {
        "messages": [
            {"role": "system", "content": PARTNER_SYSTEM_PROMPT},
            {"role": "user", "content": user_message.strip()},
        ],
        "max_tokens": 110,
        "temperature": 0.65,
        "top_p": 0.92,
    }

    last_err = "all providers failed"
    for backend in backends:
        headers = {
            "Authorization": f"Bearer {backend['api_key']}",
            "Content-Type": "application/json",
        }
        payload = dict(payload_base)
        payload["model"] = backend["model"]
        try:
            resp = requests.post(
                backend["url"],
                headers=headers,
                json=payload,
                timeout=min(18.0, max(LLM_TIMEOUT_SEC, 12.0)),
            )
            if resp.status_code != 200:
                last_err = _provider_failure_reason(backend["name"], resp.status_code, resp.text or "")
                continue
            body = resp.json()
            content = (
                body.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
            if content:
                return _shorten_partner_reply(content)
        except requests.RequestException as e:
            last_err = f"{backend['name']} network {e}"
            continue

    return _shorten_partner_reply(
        f"Hmm, I hit a snag reaching the AI ({last_err}). Try sending that again in a moment?"
    )


def generate_partner_session_wrapup(transcript: str) -> Dict[str, Any]:
    """One LLM call: short summary + improvement strings. Returns dict with summary + improvements."""
    transcript = (transcript or "").strip()
    if not transcript:
        return {
            "summary": "Nice chatting—when you're ready, we can pick it up again anytime.",
            "improvements": ["Keep short daily chats going—they add up fast."],
        }

    backends = _iter_llm_backends()
    if not backends:
        return {
            "summary": "Thanks for practicing today—every conversation counts.",
            "improvements": ["Next time, try asking one question in English you actually care about."],
        }

    user_message = f"""Here is the chat transcript (User / Emma lines). Summarize it.

{transcript[:12000]}
"""

    payload = {
        "messages": [
            {"role": "system", "content": WRAPUP_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": 220,
        "temperature": 0.45,
        "top_p": 0.9,
    }

    last_err = ""
    for backend in backends:
        headers = {
            "Authorization": f"Bearer {backend['api_key']}",
            "Content-Type": "application/json",
        }
        body = dict(payload)
        body["model"] = backend["model"]
        try:
            resp = requests.post(
                backend["url"],
                headers=headers,
                json=body,
                timeout=min(22.0, max(LLM_TIMEOUT_SEC, 14.0)),
            )
            if resp.status_code != 200:
                last_err = _provider_failure_reason(backend["name"], resp.status_code, resp.text or "")
                continue
            content = (
                resp.json()
                .get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
            obj = _parse_json_object(content)
            summary = str(obj.get("summary") or "").strip()
            imps = obj.get("improvements") or []
            if isinstance(imps, str):
                imps = [imps]
            imps = [str(x).strip() for x in imps if str(x).strip()][:3]
            if not summary:
                continue
            if not imps:
                imps = ["Keep the habit: a little English every day beats a rare long cram."]
            return {"summary": summary, "improvements": imps[:2]}
        except (requests.RequestException, ValueError, json.JSONDecodeError, KeyError, IndexError) as e:
            last_err = str(e)
            continue

    return {
        "summary": "Great session—you kept the conversation going in English.",
        "improvements": [
            "Pick one phrase you liked from today and reuse it tomorrow.",
            "If something felt hard, try the same idea with shorter sentences next time.",
        ],
    }
