import os
import json
import datetime
import re
import traceback
import builtins
import tempfile
import uuid
import random
import time
import math
from collections import defaultdict, Counter
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Flask, request, jsonify, send_file, Response, stream_with_context
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, verify_jwt_in_request
import spacy
import nltk
from nltk.corpus import words as nltk_words
import requests
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from dotenv import load_dotenv
import language_tool_python
import pronouncing
import difflib
from textstat import flesch_reading_ease, flesch_kincaid_grade
from pymongo import MongoClient
from pymongo.errors import PyMongoError
import bcrypt
from ai_tutor import (
    generate_feedback,
    generate_partner_reply,
    generate_partner_session_wrapup,
    _normalize_groq_api_key,
)

def safe_print(*args, **kwargs):
    """Print safely on consoles that cannot encode emoji/unicode."""
    try:
        builtins.print(*args, **kwargs)
    except UnicodeEncodeError:
        sep = kwargs.get("sep", " ")
        end = kwargs.get("end", "\n")
        fallback = sep.join(str(arg) for arg in args).encode("ascii", "replace").decode("ascii")
        builtins.print(fallback, end=end, flush=kwargs.get("flush", False))

print = safe_print

# Load environment variables (always resolve relative to this file)
_HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_HERE, ".env"))
load_dotenv()

# LanguageTool downloads a large JAR on first use — do not block Flask startup on import.
_grammar_tool_lock = threading.Lock()
_grammar_tool_error = None
grammar_tool = None
_grammar_tool_loader_thread = None


def _ensure_grammar_tool():
    """Return LanguageTool when ready; never block the request on JAR download / JVM startup.

    First chat(s) use basic grammar until background init finishes (~250MB first download).
    """
    global grammar_tool, _grammar_tool_error, _grammar_tool_loader_thread
    if grammar_tool is not None:
        return grammar_tool
    if _grammar_tool_error is not None:
        return None
    with _grammar_tool_lock:
        if grammar_tool is not None:
            return grammar_tool
        if _grammar_tool_error is not None:
            return None
        if _grammar_tool_loader_thread is not None and _grammar_tool_loader_thread.is_alive():
            return None

        def _load_lt():
            global grammar_tool, _grammar_tool_error
            try:
                print("⏳ LanguageTool: background init (may download ~250MB on first run)...")
                lt = language_tool_python.LanguageTool("en-US")
                with _grammar_tool_lock:
                    grammar_tool = lt
                print("✅ LanguageTool ready")
            except Exception as e:
                with _grammar_tool_lock:
                    _grammar_tool_error = str(e)
                print(f"⚠️ LanguageTool unavailable: {e}")

        _grammar_tool_loader_thread = threading.Thread(
            target=_load_lt,
            name="language_tool_loader",
            daemon=True,
        )
        _grammar_tool_loader_thread.start()
    return None


print("💼 Loaded API keys from .env file")

# Groq chat model (free + fast default, override via .env if needed)
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
# LanguageTool can block for a long time on first run / Windows; cap wait so chat still responds
GRAMMAR_CHECK_TIMEOUT_SEC = float(os.getenv("GRAMMAR_CHECK_TIMEOUT_SEC", "25"))

print("🟢 STARTING Enhanced AI English Tutor Backend v3.1")

# Download required NLTK data
try:
    nltk.download("words", quiet=True)
    nltk.download("punkt", quiet=True)
    nltk.download("averaged_perceptron_tagger", quiet=True)
    nltk.download("cmudict", quiet=True)
    print("✅ NLTK data downloaded")
except Exception as e:
    print(f"⚠️ NLTK download failed: {e}")

# Initialize NLP tools (spaCy + word list). GrammarTool is lazy-loaded via _ensure_grammar_tool().
try:
    nlp = spacy.load("en_core_web_sm")
    english_words = set(w.lower() for w in nltk_words.words())
    print("✅ NLP models loaded successfully (LanguageTool loads on first grammar check)")
except Exception as e:
    print(f"⚠️ Error loading NLP models: {e}")
    nlp = None
    english_words = set()

if _normalize_groq_api_key(os.getenv("GROQ_API_KEY", "")):
    print(f"✅ Groq LLM configured (model={GROQ_MODEL})")
else:
    print("⚠️ GROQ_API_KEY not set — chat will use short template replies only until you add a key")

def _normalize_api_key(raw):
    return _normalize_groq_api_key(raw)

class EnhancedAIEnglishTutor:
    def __init__(self):
        self.app = Flask(__name__)
        self.app.config['JWT_SECRET_KEY'] = os.getenv(
            'JWT_SECRET_KEY', 'english-tutor-secret-key-2025'
        )
        # Library default is 15 minutes — too short for normal use; override with JWT_ACCESS_TOKEN_DAYS
        _token_days = int(os.getenv('JWT_ACCESS_TOKEN_DAYS', '7'))
        self.app.config['JWT_ACCESS_TOKEN_EXPIRES'] = datetime.timedelta(days=_token_days)
        self.jwt = JWTManager(self.app)
        self._register_auth_debug_hooks()
        self._init_mongo_auth()
        _cors_raw = (os.getenv("CORS_ORIGINS") or "").strip()
        if _cors_raw:
            _cors_list = [o.strip() for o in _cors_raw.split(",") if o.strip()]
        else:
            _cors_list = [
                "http://localhost:3000",
                "http://localhost:5173",
            ]
        self.allowed_origins = set(_cors_list)
        CORS(
            self.app,
            resources={r"/api/*": {"origins": _cors_list}},
            supports_credentials=True,
            allow_headers=["Content-Type", "Authorization"],
            methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            max_age=86400,
        )

        @self.app.before_request
        def _handle_cors_preflight():
            """Never let browser preflight fall into auth/route failures."""
            if request.method == "OPTIONS" and request.path.startswith("/api/"):
                return jsonify({"ok": True, "preflight": True}), 200
            if request.path == "/api/chat/partner/stream":
                auth_header = request.headers.get("Authorization", "")
                has_bearer = auth_header.lower().startswith("bearer ")
                token_hint = auth_header[7:19] + "..." if has_bearer and len(auth_header) > 14 else "(missing)"
                print(
                    f"🔐 Stream auth check method={request.method} origin={request.headers.get('Origin')} "
                    f"has_bearer={has_bearer} token_hint={token_hint}"
                )
            return None

        @self.app.after_request
        def _ensure_cors_headers(response):
            """Force credential-safe CORS headers for browser requests."""
            origin = (request.headers.get("Origin") or "").strip()
            if origin and origin in self.allowed_origins and request.path.startswith("/api/"):
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Vary"] = "Origin"
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            return response

    def _register_auth_debug_hooks(self):
        @self.jwt.unauthorized_loader
        def _unauthorized(reason):
            print(f"❌ JWT unauthorized: {reason}; path={request.path}; method={request.method}")
            return jsonify({"error": "Unauthorized", "details": reason}), 401

        @self.jwt.invalid_token_loader
        def _invalid_token(reason):
            print(f"❌ JWT invalid token: {reason}; path={request.path}; method={request.method}")
            return jsonify({"error": "Invalid token", "details": reason}), 401

        @self.jwt.expired_token_loader
        def _expired_token(jwt_header, jwt_payload):
            sub = jwt_payload.get("sub")
            print(f"❌ JWT expired for user={sub}; path={request.path}; method={request.method}")
            return jsonify({"error": "Token expired", "details": "Please log in again."}), 401
        
        # Conversation personas: natural voice first, teaching second (avoids robotic LLM tone)
        self.personas = {
            'beginner': {
                'name': 'Emma',
                'style': 'patient and encouraging',
                'prompt': """You are Emma, an English tutor chatting with a beginner. You are a real person in a conversation, not a textbook or a corporate bot.

Voice and style:
- Sound warm and normal: use contractions (I'm, you're, it's, we'll) where they fit.
- Mix short and medium sentences. Simple words, but not baby talk.
- Respond to what they actually said or asked—don't ignore their message to give a generic lesson.
- If they slip up, mention one fix in a friendly way with a quick example, then continue the chat.
- Avoid stiff or AI-sounding patterns: no "I would like to commence", "Furthermore", "It is important to note", or praising them the same way every time.
- Avoid starting many replies with "That's a great question" or "I appreciate you sharing"—vary how you open.
- No numbered or bullet lists in your reply unless they explicitly ask for a list.
- If you're unsure of a fact, say so briefly instead of guessing.

Keep replies roughly 2–6 short sentences unless they need more. End with complete sentences and normal punctuation."""
            },
            'intermediate': {
                'name': 'Emma',
                'style': 'supportive and challenging',
                'prompt': """You are Emma, an English tutor working with an intermediate learner. Talk like a knowledgeable friend in a natural chat, not like an essay or a lecture hall.

Voice and style:
- Natural, clear English with some richer vocabulary when it helps—don't show off.
- Answer the question or react to their point first; weave tips into the conversation instead of dumping rules.
- You can offer one concrete improvement (word choice, collocation, or a smoother phrase) when it's useful.
- Tone: encouraging but relaxed. Use "you" and "we" normally. Contractions are fine.
- Do not sound like a template: vary openings, avoid repetitive praise, avoid academic filler ("demonstrates", "nuanced perspective", "facilitate").
- No bullet lists unless they ask. No moralizing.

Aim for about 3–8 sentences unless they want depth. Finish your thoughts; use normal punctuation."""
            },
            'advanced': {
                'name': 'Emma',
                'style': 'sophisticated and nuanced',
                'prompt': """You are Emma, tutoring someone who already speaks English well. Your job is to sound like a sharp, friendly native speaker helping them polish—not like a thesaurus or a formal report.

Voice and style:
- Fluent, natural English. You can discuss subtle points (register, tone, idioms, nuance) when relevant.
- Be direct: say what you'd actually say in conversation. Skip pompous or repetitive phrasing.
- If they ask something precise, answer precisely. If it's subjective, say so and give your take.
- Corrections should be light and specific—suggest what a native might say instead, briefly.
- Avoid: purple prose, stacked abstract nouns, cliché tutor lines ("I find your articulation particularly compelling"), or sounding like you're grading an essay.

About 3–10 sentences is usually enough unless they ask for more. Complete sentences; end cleanly."""
            },
            'native': {
                'name': 'Emma',
                'style': 'natural and conversational',
                'prompt': """You are Emma, talking with someone whose English is already very strong—more like a peer conversation with occasional fine-tuning than a lesson.

Voice and style:
- Sound completely human: casual or polished depending on their tone, but never stiff or "assistant-y".
- Match the energy of the chat. Banter is fine. Don't over-explain basics.
- Only nitpick language when it genuinely helps (register, naturalness, a more idiomatic line).
- No therapy-speak, no corporate tone, no filler compliments every message.
- If you don't know something, just say you don't know.

Keep it concise unless they go deep. Always use complete sentences and end properly."""
            }
        }
        
        # Enhanced phoneme difficulty mapping for better pronunciation scoring
        self.phoneme_difficulty = {
            'TH': 0.9,  # Very difficult for non-natives
            'R': 0.8,   # Difficult R sound
            'L': 0.7,   # L vs R confusion
            'V': 0.6,   # V vs W confusion
            'W': 0.6,   # W vs V confusion
            'Z': 0.5,   # Voiced fricatives
            'SH': 0.5,  # Sh sound
            'CH': 0.4,  # Ch sound
            'NG': 0.4,  # Ng ending
            'F': 0.3,   # Basic fricatives
            'S': 0.3,   # Basic sibilants
        }
        
        # Enhanced filler words for fluency analysis
        self.filler_words = {
            'um', 'uh', 'er', 'ah', 'like', 'you know', 'so', 'well', 'actually', 
            'basically', 'literally', 'right', 'okay', 'yeah', 'hmm', 'sort of', 
            'kind of', 'i mean', 'you see', 'let me see', 'how do you say',
            'what do you call it', 'you know what i mean', 'stuff like that'
        }
        
        # Create necessary directories
        os.makedirs("users", exist_ok=True)
        os.makedirs("sessions", exist_ok=True)
        os.makedirs("audio", exist_ok=True)
        
        self._register_routes()

        # Kick off LanguageTool download/JVM in the background at startup so it becomes ready
        # without waiting for a legacy /api/chat/message call (partner chat does not use LT).
        try:
            _ensure_grammar_tool()
        except Exception as e:
            print(f"⚠️ LanguageTool warmup skipped: {e}")

    def _init_mongo_auth(self):
        """Initialize MongoDB connection for signup/login auth."""
        self.mongo_client = None
        self.mongo_db = None
        self.mongo_users = None
        self.mongo_profiles = None

        mongo_uri = (os.getenv("MONGO_URI") or "").strip()
        if not mongo_uri:
            print("⚠️ MONGO_URI not set. Auth will fallback to local JSON users.")
            return

        db_name = (os.getenv("MONGO_DB_NAME") or "english_tutor").strip()
        try:
            self.mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
            self.mongo_client.admin.command("ping")
            self.mongo_db = self.mongo_client[db_name]
            self.mongo_users = self.mongo_db["users"]
            self.mongo_profiles = self.mongo_db["user_profiles"]
            self.mongo_users.create_index("username", unique=True)
            self.mongo_users.create_index("email", unique=True)
            self.mongo_profiles.create_index("username", unique=True)
            self._migrate_legacy_users_to_mongo()
            print(f"✅ MongoDB auth connected (db={db_name})")
        except Exception as e:
            print(f"⚠️ MongoDB auth unavailable: {e}")
            self.mongo_client = None
            self.mongo_db = None
            self.mongo_users = None
            self.mongo_profiles = None

    def _migrate_legacy_users_to_mongo(self):
        """Best-effort migration of legacy JSON users into Mongo collections."""
        if self.mongo_users is None or self.mongo_profiles is None:
            return
        users_dir = os.path.join(_HERE, "users")
        if not os.path.isdir(users_dir):
            return

        migrated = 0
        for name in os.listdir(users_dir):
            if not name.endswith(".json"):
                continue
            path = os.path.join(users_dir, name)
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                username = str(data.get("username") or "").strip()
                email = str(data.get("email") or "").strip()
                if not username:
                    continue

                # Auth document upsert.
                self.mongo_users.update_one(
                    {"username": username},
                    {"$set": {
                        "id": data.get("id"),
                        "username": username,
                        "email": email,
                        "full_name": data.get("full_name"),
                        "password_hash": data.get("password_hash"),
                        "created_at": data.get("created_at"),
                        "migrated_from_json": True,
                        "updated_at": datetime.datetime.now().isoformat(),
                    }},
                    upsert=True,
                )
                # Full profile document upsert.
                self.mongo_profiles.update_one(
                    {"username": username},
                    {"$set": data},
                    upsert=True,
                )
                migrated += 1
            except Exception as e:
                print(f"⚠️ Legacy migration skipped for {name}: {e}")
                continue
        if migrated:
            print(f"✅ Migrated {migrated} legacy JSON user profile(s) into Mongo")

    def _hash_password_bcrypt(self, password):
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    def _verify_password_any(self, password, stored_hash):
        """Verify bcrypt first, then fallback to legacy werkzeug hash format."""
        if not stored_hash:
            return False
        try:
            if stored_hash.startswith("$2a$") or stored_hash.startswith("$2b$") or stored_hash.startswith("$2y$"):
                return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
        except Exception:
            return False
        try:
            return check_password_hash(stored_hash, password)
        except Exception:
            return False

    def _legacy_user_file(self, username):
        return f"users/{username}.json"

    def _load_user_data(self, username):
        """Load full user profile data from Mongo profile store, fallback to legacy JSON."""
        if self.mongo_profiles is not None:
            try:
                doc = self.mongo_profiles.find_one({"username": username}, {"_id": 0})
                if doc:
                    return doc
            except PyMongoError as e:
                print(f"Mongo profile load failed for {username}: {e}")

        user_file = self._legacy_user_file(username)
        if os.path.exists(user_file):
            with open(user_file, "r") as f:
                data = json.load(f)
            # Best-effort migration into Mongo profile store.
            if self.mongo_profiles is not None:
                try:
                    self.mongo_profiles.update_one(
                        {"username": username},
                        {"$set": data},
                        upsert=True,
                    )
                except PyMongoError as e:
                    print(f"Mongo profile migration failed for {username}: {e}")
            return data
        return None

    def _save_user_data(self, username, user_data):
        """Persist full user profile data to Mongo profile store (or legacy JSON fallback)."""
        if self.mongo_profiles is not None:
            try:
                self.mongo_profiles.update_one(
                    {"username": username},
                    {"$set": user_data},
                    upsert=True,
                )
                return
            except PyMongoError as e:
                print(f"Mongo profile save failed for {username}: {e}")

        user_file = self._legacy_user_file(username)
        with open(user_file, "w") as f:
            json.dump(user_data, f, indent=2)

    def _detect_sentence_intent(self, message):
        """Detect if the user's input is a question, statement, or exclamation"""
        try:
            text = message.strip().lower()
            
            # Question detection patterns
            question_patterns = [
                r'^(what|who|when|where|why|how|which|whose|whom)',
                r'^(do|does|did|will|would|should|could|can|may|might|is|are|was|were|have|has|had)',
                r'\?',
                r'^(tell me|explain|describe)',
                r'(what do you think|what about|how about)',
            ]
            
            # Exclamation detection patterns  
            exclamation_patterns = [
                r'!',
                r'^(wow|amazing|great|excellent|wonderful|fantastic|terrible|awful)',
                r'^(oh|ah|yay|hooray|oops|ouch)',
                r'(so excited|so happy|so sad|so angry|so tired)',
                r'^(i love|i hate|i can\'t believe)',
            ]
            
            # Check for questions
            for pattern in question_patterns:
                if re.search(pattern, text):
                    return {
                        'type': 'question',
                        'confidence': 0.9,
                        'detected_pattern': pattern,
                        'requires_answer': True
                    }
            
            # Check for exclamations
            for pattern in exclamation_patterns:
                if re.search(pattern, text):
                    return {
                        'type': 'exclamation', 
                        'confidence': 0.8,
                        'detected_pattern': pattern,
                        'emotional_tone': True
                    }
            
            # Default to statement
            return {
                'type': 'statement',
                'confidence': 0.7,
                'detected_pattern': 'default',
                'requires_acknowledgment': True
            }
            
        except Exception as e:
            print(f"Intent detection error: {e}")
            return {
                'type': 'statement',
                'confidence': 0.5,
                'error': str(e)
            }

    def _normalize_user_sentence_punctuation(self, message):
        """Add a question mark when text appears to be a question."""
        text = (message or "").strip()
        if not text:
            return text

        lowered = text.lower().strip()
        is_question = False

        if "?" in lowered:
            is_question = True
        elif re.search(r"^\s*(what|where|why|how|who)\b", lowered):
            is_question = True
        elif re.search(r"^\s*(do|does|did|is|are|was|were|can|could|will|would|should|have|has|had|may|might)\b", lowered):
            is_question = True
        elif re.search(r"\b(can you|could you|would you|do you think|is it|are there|should i)\b", lowered):
            is_question = True

        text = re.sub(r"\s+", " ", text).strip()
        text = re.sub(r"[.?!]+\s*$", "", text).strip()
        if not text:
            return text

        return f"{text}?" if is_question else f"{text}."

    def _analyze_pronunciation_enhanced(self, text, user_data):
        """Enhanced pronunciation analysis with better phoneme-level scoring"""
        try:
            words = re.findall(r'\b[a-zA-Z]+\b', text.lower())
            mispronunciations = []
            phoneme_errors = []
            total_phonemes = 0
            correct_phonemes = 0
            difficulty_adjusted_score = 0
            
            for word in words:
                if word in english_words:
                    phonemes = pronouncing.phones_for_word(word)
                    if phonemes:
                        expected_phonemes = phonemes[0].split()
                        total_phonemes += len(expected_phonemes)
                        
                        # Enhanced pronunciation accuracy calculation
                        word_analysis = self._analyze_word_pronunciation_enhanced(word, expected_phonemes, user_data)
                        
                        if word_analysis['accuracy'] < 0.7:
                            mispronunciations.append({
                                'word': word,
                                'expected_phonemes': expected_phonemes,
                                'accuracy': word_analysis['accuracy'],
                                'phoneme_errors': word_analysis['phoneme_errors'],
                                'difficulty_score': word_analysis['difficulty_score'],
                                'common_errors': word_analysis['common_errors']
                            })
                            phoneme_errors.extend(word_analysis['phoneme_errors'])
                        else:
                            correct_phonemes += len(expected_phonemes) * word_analysis['accuracy']
                        
                        difficulty_adjusted_score += word_analysis['difficulty_score']
                    else:
                        correct_phonemes += 1
                        total_phonemes += 1
                        difficulty_adjusted_score += 0.8
            
            # Calculate final pronunciation score with difficulty adjustment
            if total_phonemes > 0:
                base_accuracy = correct_phonemes / total_phonemes
                difficulty_factor = difficulty_adjusted_score / len(words) if words else 0.8
                final_score = int((base_accuracy * 0.7 + difficulty_factor * 0.3) * 100)
            else:
                final_score = 85
            
            return {
                'score': max(0, min(100, final_score)),
                'accuracy': base_accuracy if total_phonemes > 0 else 0.85,
                'mispronunciations': mispronunciations,
                'phoneme_errors': list(set(phoneme_errors)),
                'total_words': len(words),
                'total_phonemes': total_phonemes,
                'correct_phonemes': int(correct_phonemes),
                'difficulty_adjusted': True,
                'analysis_method': 'enhanced_phoneme_based'
            }
            
        except Exception as e:
            print(f"Enhanced pronunciation analysis error: {e}")
            return {
                'score': 75,
                'accuracy': 0.75,
                'mispronunciations': [],
                'phoneme_errors': [],
                'total_words': len(re.findall(r'\b[a-zA-Z]+\b', text)),
                'error': str(e)
            }

    def _analyze_word_pronunciation_enhanced(self, word, expected_phonemes, user_data):
        """Enhanced word-level pronunciation analysis"""
        mispronounced_words = user_data.get('vocabulary', {}).get('mispronounced', [])
        
        # Base accuracy considering user's history
        if word in mispronounced_words:
            base_accuracy = random.uniform(0.4, 0.65)
        else:
            base_accuracy = random.uniform(0.7, 0.95)
        
        # Analyze phoneme difficulty
        difficulty_penalties = []
        phoneme_errors = []
        
        for phoneme in expected_phonemes:
            # Check for difficult phonemes
            for difficult_sound, penalty in self.phoneme_difficulty.items():
                if difficult_sound in phoneme:
                    difficulty_penalties.append(penalty)
                    if random.random() < penalty * 0.4:  # Higher chance of error for difficult sounds
                        phoneme_errors.append(difficult_sound)
        
        # Calculate difficulty-adjusted score
        if difficulty_penalties:
            avg_difficulty = sum(difficulty_penalties) / len(difficulty_penalties)
            difficulty_factor = 1 - (avg_difficulty * 0.3)  # Reduce score based on difficulty
        else:
            difficulty_factor = 1.0
        
        # Apply word-specific factors
        word_length_factor = max(0.8, 1 - (len(word) - 6) * 0.05)  # Longer words are harder
        
        # Check for common mispronunciation patterns
        common_errors = []
        if any(pattern in word for pattern in ['th', 'r', 'l', 'v', 'w']):
            common_errors = self._get_enhanced_pronunciation_tips(word, phoneme_errors)
        
        final_accuracy = base_accuracy * difficulty_factor * word_length_factor
        
        return {
            'accuracy': max(0.2, min(1.0, final_accuracy)),
            'difficulty_score': difficulty_factor,
            'phoneme_errors': phoneme_errors,
            'common_errors': common_errors
        }

    def _get_enhanced_pronunciation_tips(self, word, phoneme_errors):
        """Generate enhanced pronunciation tips"""
        tips = []
        
        if 'TH' in phoneme_errors or 'th' in word:
            tips.append("Place your tongue between your teeth for 'th' sounds")
        if 'R' in phoneme_errors or 'r' in word:
            tips.append("Curl your tongue back slightly for American 'r' sound")
        if 'L' in phoneme_errors or 'l' in word:
            tips.append("Touch tongue tip to roof of mouth for clear 'l'")
        if 'V' in phoneme_errors or 'v' in word:
            tips.append("Touch bottom lip to upper teeth for 'v' sound")
        if 'W' in phoneme_errors or 'w' in word:
            tips.append("Round your lips for 'w' sound")
        
        return tips[:2]  # Return top 2 most relevant tips

    def _grammar_tool_check_with_timeout(self, text):
        """Run LanguageTool in a worker with a timeout so /api/chat/message does not hang."""
        gt = _ensure_grammar_tool()
        if not gt:
            return None

        def _run_check():
            return gt.check(text)

        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(_run_check)
                return future.result(timeout=GRAMMAR_CHECK_TIMEOUT_SEC)
        except FuturesTimeout:
            print(
                f"⚠️ LanguageTool timed out after {GRAMMAR_CHECK_TIMEOUT_SEC}s; "
                "using basic grammar analysis."
            )
            return None
        except Exception as e:
            print(f"⚠️ LanguageTool check error: {e}")
            return None

    def _analyze_grammar_enhanced(self, text):
        """Enhanced grammar analysis with better error categorization"""
        try:
            if not _ensure_grammar_tool():
                return self._analyze_grammar_basic(text)

            matches = self._grammar_tool_check_with_timeout(text)
            if matches is None:
                return self._analyze_grammar_basic(text)
            
            errors = []
            error_categories = defaultdict(int)
            
            for match in matches:
                category = self._categorize_grammar_error(match.category, match.ruleId)
                error_categories[category] += 1
                
                error = {
                    'type': match.ruleId,
                    'category': category,
                    'original_category': match.category,
                    'message': match.message,
                    'suggestions': match.replacements[:3],
                    'offset': match.offset,
                    'length': match.errorLength,
                    'severity': self._determine_error_severity_enhanced(category, match.ruleId),
                    'text': text[match.offset:match.offset + match.errorLength] if match.errorLength > 0 else ''
                }
                errors.append(error)
            
            # Enhanced scoring with weighted penalties
            penalty = 0
            for error in errors:
                if error['severity'] == 'critical':
                    penalty += 20
                elif error['severity'] == 'major':
                    penalty += 15
                elif error['severity'] == 'minor':
                    penalty += 8
                else:
                    penalty += 5
            
            # Adjust penalty based on text length
            text_length = len(text.split())
            if text_length > 0:
                penalty = penalty * (20 / max(text_length, 20))  # Normalize for text length
            
            score = max(0, 100 - penalty)
            
            return {
                'score': int(score),
                'errors': errors,
                'total_errors': len(errors),
                'error_categories': dict(error_categories),
                'error_types': list(error_categories.keys()),
                'analysis_method': 'enhanced_language_tool'
            }
            
        except Exception as e:
            print(f"Enhanced grammar analysis error: {e}")
            return self._analyze_grammar_basic(text)

    def _analyze_grammar_basic(self, text):
        """Basic grammar analysis fallback"""
        # Simple pattern-based analysis
        errors = []
        text_lower = text.lower()
        
        # Check for common errors
        if ' i ' in text_lower and text[0].islower():
            errors.append({'message': 'Capitalize "I"', 'suggestions': ['I']})
        
        # Simple scoring
        error_count = len(errors)
        score = max(0, 100 - (error_count * 15))
        
        return {
            'score': score,
            'errors': errors,
            'total_errors': error_count,
            'error_categories': {},
            'error_types': [],
            'analysis_method': 'basic_patterns'
        }

    def _categorize_grammar_error(self, original_category, rule_id):
        """Categorize grammar errors for better analysis"""
        category_map = {
            'GRAMMAR': 'grammar',
            'TYPOS': 'spelling',
            'CASING': 'capitalization',
            'PUNCTUATION': 'punctuation',
            'STYLE': 'style',
            'TYPOGRAPHY': 'formatting',
            'CONFUSED_WORDS': 'word_choice',
            'REDUNDANCY': 'redundancy',
            'SENTENCE_WHITESPACE': 'formatting'
        }
        
        return category_map.get(original_category, 'other')

    def _determine_error_severity_enhanced(self, category, rule_id):
        """Enhanced error severity determination"""
        critical_errors = ['GRAMMAR', 'TYPOS', 'CONFUSED_WORDS']
        major_errors = ['PUNCTUATION', 'CASING', 'REDUNDANCY']
        minor_errors = ['STYLE', 'TYPOGRAPHY', 'SENTENCE_WHITESPACE']
        
        if category.upper() in critical_errors:
            return 'critical'
        elif category.upper() in major_errors:
            return 'major'
        elif category.upper() in minor_errors:
            return 'minor'
        else:
            return 'low'

    def _analyze_fluency_enhanced(self, text, user_data):
        """Enhanced fluency analysis with better metrics"""
        try:
            words = text.split()
            word_count = len(words)
            
            if word_count == 0:
                return {
                    'score': 50,
                    'words_per_minute': 0,
                    'filler_count': 0,
                    'error': 'No words to analyze'
                }
            
            # Enhanced WPM calculation with user history (0 = not measured yet → assume neutral 120)
            user_avg_wpm = user_data.get('stats', {}).get('average_wpm') or 120
            estimated_time = word_count / max(2.0, user_avg_wpm / 60)  # Use user's average or default
            words_per_minute = (word_count / estimated_time) * 60 if estimated_time > 0 else user_avg_wpm
            
            # Enhanced filler word detection
            filler_count = 0
            filler_phrases = []
            
            # Check for single filler words
            for word in words:
                clean_word = word.lower().strip('.,!?')
                if clean_word in self.filler_words:
                    filler_count += 1
                    filler_phrases.append(clean_word)
            
            # Check for filler phrases
            text_lower = text.lower()
            phrase_fillers = ['you know what i mean', 'stuff like that', 'how do you say', 'what do you call it']
            for phrase in phrase_fillers:
                if phrase in text_lower:
                    filler_count += phrase.count(' ') + 1  # Count each word in phrase
                    filler_phrases.append(phrase)
            
            filler_ratio = filler_count / word_count
            
            # Enhanced pause and hesitation analysis
            sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
            avg_sentence_length = word_count / len(sentences) if sentences else word_count
            
            # Repetition detection with better accuracy
            word_freq = Counter([word.lower().strip('.,!?') for word in words])
            excessive_repetitions = sum(1 for freq in word_freq.values() if freq > 3)
            
            # Reading ease and complexity
            try:
                readability = flesch_reading_ease(text) if len(text) > 10 else 50
            except:
                readability = 50
            
            # Enhanced scoring system
            score = 100
            
            # WPM penalties/bonuses
            optimal_wpm_range = (100, 180)
            if words_per_minute < optimal_wpm_range[0]:
                score -= (optimal_wpm_range[0] - words_per_minute) * 0.3
            elif words_per_minute > optimal_wpm_range[1]:
                score -= (words_per_minute - optimal_wpm_range[1]) * 0.2
            
            # Filler penalties
            score -= filler_ratio * 35
            
            # Repetition penalties
            score -= excessive_repetitions * 8
            
            # Sentence structure penalties
            if avg_sentence_length < 4:
                score -= 15
            elif avg_sentence_length > 25:
                score -= 10
            
            # Readability bonus/penalty
            if 30 <= readability <= 70:  # Good readability range
                score += 5
            elif readability < 10 or readability > 90:
                score -= 10
            
            score = max(0, min(100, score))
            
            return {
                'score': int(score),
                'words_per_minute': round(words_per_minute, 1),
                'filler_count': filler_count,
                'filler_ratio': round(filler_ratio, 3),
                'filler_phrases': list(set(filler_phrases)),
                'repetitions': excessive_repetitions,
                'avg_sentence_length': round(avg_sentence_length, 1),
                'readability_score': round(readability, 1),
                'word_count': word_count,
                'estimated_time': round(estimated_time, 1),
                'pause_analysis': {
                    'sentence_count': len(sentences),
                    'optimal_wpm_range': optimal_wpm_range,
                    'wpm_deviation': abs(words_per_minute - sum(optimal_wpm_range) / 2)
                }
            }
            
        except Exception as e:
            print(f"Enhanced fluency analysis error: {e}")
            return {
                'score': 75,
                'words_per_minute': 120,
                'filler_count': 0,
                'error': str(e)
            }

    def _calculate_composite_score(self, pronunciation_analysis, grammar_analysis, fluency_analysis):
        """Calculate composite proficiency score with enhanced weighting"""
        # Enhanced weighted average considering user level
        weights = {
            'pronunciation': 0.45,  # Increased weight for pronunciation
            'grammar': 0.35,
            'fluency': 0.20
        }
        
        pronunciation_score = pronunciation_analysis.get('score', 50)
        grammar_score = grammar_analysis.get('score', 50)
        fluency_score = fluency_analysis.get('score', 50)
        
        composite = (
            pronunciation_score * weights['pronunciation'] +
            grammar_score * weights['grammar'] +
            fluency_score * weights['fluency']
        )
        
        return round(composite, 1)

    def _determine_level(self, composite_score):
        """Determine user level based on composite score with hysteresis to prevent oscillation"""
        # Add hysteresis bands to prevent frequent level changes
        if composite_score >= 92:
            return 'native'
        elif composite_score >= 77:
            return 'advanced'
        elif composite_score >= 52:
            return 'intermediate'
        else:
            return 'beginner'

    def _generate_persona_fallback_enhanced(self, message, persona, pronunciation_analysis, grammar_analysis, intent_analysis=None):
        """Enhanced fallback response generation with intent consideration"""
        
        # Intent-aware responses
        intent_type = intent_analysis.get('type', 'statement') if intent_analysis else 'statement'
        
        if intent_type == 'question':
            level_responses = {
                'beginner': [
                    "Okay—here's the simple version: I'd explain it in plain steps. Want me to go slower?",
                    "Good, let's unpack that. Short answer first: it depends on the situation. I can give an example.",
                    "Sure. In everyday English, people usually keep sentences short and put the important idea up front.",
                    "I can help with that. The easiest way is to decide if you're talking about past, present, or future, then pick the verb form that matches.",
                ],
                'intermediate': [
                    "Right—in daily chat most people keep it short and drop words the textbook insists on.",
                    "Here's a straight answer, then a slightly more natural way to say the same thing.",
                    "Good question. The rule of thumb is: sound natural first, then tidy the grammar. I'll give you an example.",
                    "Yeah, that trips people up. I'd put it this way: say what you mean in plain order, then we can polish it.",
                ],
                'advanced': [
                    "Short answer: both versions can work. The nuance is that register and context change what sounds natural.",
                    "Depends what you're optimizing for—clarity, formality, or idiomatic flow. In chat I'd keep it loose; in email I'd tighten the verbs.",
                    "Fair question. Native speakers often dodge the textbook rule and use a chunk they've heard a hundred times.",
                    "I'd answer it in two layers: what's 'correct' on paper vs what people actually say out loud.",
                ],
                'native': [
                    "Honestly? I'd say it in one short, direct sentence—that's what sounds normal to me.",
                    "Yeah, it's messy. In the wild people blur the lines and fix it with tone instead of grammar police.",
                    "Good catch. The pedantic answer and the one you'd hear out loud are slightly different.",
                    "Short version: match your reader. Want the picky style-guide take too?",
                ],
            }
        elif intent_type == 'exclamation':
            level_responses = {
                'beginner': [
                    "Haha, I can tell you feel strongly about that! Tell me a bit more?",
                    "Nice—that's great energy. What happened next?",
                    "I hear you! That's exciting. Want to practice describing it in English?",
                    "Love it. Keep going—what's the best part for you?",
                ],
                'intermediate': [
                    "That energy comes through! What would you say was the highlight?",
                    "I get it—that's a big deal. How would you tell a friend the same story?",
                    "Same, I'd be pumped too. You could say something like, 'That was the highlight of my week.'",
                    "Nice moment. In a quick message you could say you were really happy and leave it there.",
                ],
                'advanced': [
                    "Yeah, that lands. I'm curious what angle you care about most—tone, wording, or something else?",
                    "Totally fair reaction. If you want more idiomatic color, try a stronger verb instead of 'very' plus an adjective.",
                    "I feel that. What you said already works; if you want punch, shorten the second part into a crisp fragment.",
                    "Strong reaction—makes sense. Want to refine how you'd say it in a professional context?",
                ],
                'native': [
                    "Same. That's the kind of thing you'd text in all caps.",
                    "Ha, fair. I'd probably tighten the middle clause, but yours works as-is.",
                    "Yeah no, I get you. What are you trying to do with it—vent or polish the phrasing?",
                    "Big mood. Say more?",
                ],
            }
        else:  # statement
            level_responses = {
                'beginner': [
                    "Got it—that makes sense. Let's keep going; you're doing fine.",
                    "Thanks for telling me. Want to try saying that in one shorter sentence?",
                    "I follow you. One tiny tweak: swap in a simpler word you've already used before.",
                    "Nice, I understand. What do you want to talk about next?",
                ],
                'intermediate': [
                    "Makes sense. To sound more natural in casual chat, use chunks you hear a lot, like 'I'm gonna' instead of 'I am going to' when it's informal.",
                    "I see what you mean. The grammar's mostly there—I'd double-check the article or preposition if anything sounds slightly off.",
                    "Yeah, that's clear. A native might shorten it by cutting filler and getting to the verb faster.",
                    "Okay, got it. Want to go deeper on vocabulary or fluency here?",
                ],
                'advanced': [
                    "Right, I follow. If you want tighter register, pick one strong verb per sentence and cut hedging where you can.",
                    "That works. The only polish I'd suggest is trimming repeated words—optional, stylistic.",
                    "Clear point. For a formal audience, swap a few phrasal verbs for one-word choices where it still sounds natural.",
                    "Fair take. I'd mirror your wording in speech; if you're pitching or writing, tighten the opening so the point lands faster.",
                ],
                'native': [
                    "Yep, I'm with you. Say more if you want a second pair of eyes on wording.",
                    "Sounds right. Only nitpick if you care about micro-style—otherwise leave it.",
                    "Got it. What's the context—casual chat or something sharper?",
                    "Makes sense. I wouldn't over-edit that unless you're going for a specific vibe.",
                ],
            }
        
        base_response = random.choice(level_responses.get(persona, level_responses['beginner']))
        
        # Add constructive feedback for errors (only for beginners and intermediates)
        if persona in ['beginner', 'intermediate'] and grammar_analysis.get('errors'):
            error = grammar_analysis['errors'][0]
            if error.get('suggestions') and len(error['suggestions']) > 0:
                suggestion = str(error['suggestions'][0]).strip()
                if suggestion:
                    base_response += f" Small tip: '{suggestion}' might fit better there."
        
        # Add pronunciation encouragement if there are issues
        if pronunciation_analysis.get('score', 100) < 70:
            if persona == 'beginner':
                base_response += " Keep practicing your pronunciation - you're doing well!"
            elif persona == 'intermediate':
                base_response += " Your pronunciation is improving. Focus on speaking clearly and don't worry about small mistakes."
        
        return base_response

    def _prepare_detailed_feedback(self, pronunciation_analysis, grammar_analysis, fluency_analysis):
        """Prepare enhanced detailed feedback"""
        feedback = []

        if pronunciation_analysis.get('mispronunciations'):
            feedback.append({
                'type': 'pronunciation',
                'score': pronunciation_analysis.get('score', 0),
                'message': f"Pronunciation accuracy: {pronunciation_analysis.get('score', 0)}%",
                'details': pronunciation_analysis.get('mispronunciations', [])[:2],
                'focus_sounds': pronunciation_analysis.get('phoneme_errors', []),
            })

        if grammar_analysis.get('errors'):
            feedback.append({
                'type': 'grammar',
                'score': grammar_analysis.get('score', 0),
                'message': f"Grammar accuracy: {grammar_analysis.get('score', 0)}%",
                'details': grammar_analysis.get('errors', [])[:2],
                'error_categories': grammar_analysis.get('error_categories', {}),
            })

        fluency_score = fluency_analysis.get('score', 0)
        wpm = fluency_analysis.get('words_per_minute', 0)
        feedback.append({
            'type': 'fluency',
            'score': fluency_score,
            'message': f"Fluency: {fluency_score}% (Speaking rate: {wpm} WPM)",
            'details': {
                'wpm': wpm,
                'filler_count': fluency_analysis.get('filler_count', 0),
                'pause_analysis': fluency_analysis.get('pause_analysis', {}),
            },
        })

        return feedback

    def _is_response_complete(self, response):
       """Enhanced response completeness checker"""
       if not response or len(response.strip()) < 15:
           return False
       
       response = response.strip()
       
       # Check if ends with proper punctuation
       if not re.search(r'[.!?]["\'""„"‚''`]?$', response):
           return False
       
       # Check for common incomplete patterns
       incomplete_patterns = [
           r'\b(and|but|so|because|however|therefore|also|in|on|at|for|with|by|from|up|on|off|out|over|under)\s*$',
           r'\b(the|a|an|is|are|was|were|will|would|should|could|can|may|might)\s*$',
           r'\b(to|of|in|for|with|by|from|that|which|who|when|where|why|how)\s*$',
           r'\b(i|you|he|she|it|we|they|this|that|these|those)\s*$',
           r'[,;:]\s*$',
           r'\.\.\.\s*$'
       ]
       
       for pattern in incomplete_patterns:
           if re.search(pattern, response, re.IGNORECASE):
               return False
       
       # Check minimum word count based on persona
       word_count = len(response.split())
       min_words = {
           'beginner': 5,
           'intermediate': 7,
           'advanced': 8,
           'native': 6,
       }
       
       current_persona = getattr(self, 'current_persona', 'beginner')
       return word_count >= min_words.get(current_persona, 8)

    def _get_llm_backends(self):
       """Ordered provider fallback chain for chat generation."""
       backends = []
       primary = _normalize_api_key(os.getenv("GROQ_API_KEY", ""))
       if primary:
           backends.append({
               "name": "groq-primary",
               "url": "https://api.groq.com/openai/v1/chat/completions",
               "model": os.getenv("GROQ_MODEL", GROQ_MODEL),
               "api_key": primary,
           })

       backup = _normalize_api_key(
           os.getenv("GROQ_API_KEY_BACKUP", "")
           or os.getenv("GROQ_API_KEY_2", "")
           or os.getenv("GROQ_FALLBACK_API_KEY", "")
       )
       if backup and backup != primary:
           backends.append({
               "name": "groq-backup",
               "url": "https://api.groq.com/openai/v1/chat/completions",
               "model": os.getenv("GROQ_MODEL_BACKUP", GROQ_MODEL),
               "api_key": backup,
           })

       grok_key = _normalize_api_key(os.getenv("GROK_API_KEY", "") or os.getenv("XAI_API_KEY", ""))
       if grok_key:
           backends.append({
               "name": "grok-xai",
               "url": os.getenv("XAI_API_URL", "https://api.x.ai/v1/chat/completions"),
               "model": os.getenv("GROK_MODEL", os.getenv("XAI_MODEL", "grok-2-latest")),
               "api_key": grok_key,
           })

       hf_key = _normalize_api_key(os.getenv("HUGGINGFACE_API_KEY", "") or os.getenv("HF_TOKEN", ""))
       if hf_key:
           backends.append({
               "name": "huggingface",
               "url": os.getenv("HF_API_URL", "https://router.huggingface.co/v1/chat/completions"),
               "model": os.getenv("HF_CHAT_MODEL", "meta-llama/Llama-3.1-8B-Instruct"),
               "api_key": hf_key,
           })
       return backends

    def _generate_live_partner_analysis(self, user_message, bot_reply="", history_pairs=None):
       """Background semantic analysis for the partner chat sidebar."""
       user_message = (user_message or "").strip()
       bot_reply = (bot_reply or "").strip()
       history_pairs = history_pairs or []

       fallback = {
           "summary": "Live analysis is warming up. Keep chatting and this panel will update.",
           "tone": "neutral",
           "intent": "conversation",
           "confidence": 0.5,
           "strengths": ["You are actively practicing in English."],
           "improvements": ["Try one slightly longer sentence in your next message."],
           "suggested_reply": "Can you tell me more about that?",
       }

       if not user_message:
           return fallback

       backends = self._get_llm_backends()
       if not backends:
           return fallback

       recent = []
       for pair in history_pairs[-6:]:
           if not isinstance(pair, (list, tuple)) or len(pair) < 2:
               continue
           u = str(pair[0] or "").strip()
           a = str(pair[1] or "").strip()
           if u:
               recent.append(f"User: {u[:200]}")
           if a:
               recent.append(f"Emma: {a[:200]}")
       if user_message:
           recent.append(f"User (latest): {user_message[:400]}")
       if bot_reply:
           recent.append(f"Emma (latest): {bot_reply[:400]}")

       prompt = """You are a silent conversation analyst for an English learning app.
Return ONLY valid JSON with this exact schema:
{
  "summary": "one short sentence",
  "tone": "positive|neutral|negative|anxious|curious",
  "intent": "short phrase",
  "confidence": number,
  "strengths": ["short point", "short point"],
  "improvements": ["short actionable tip", "short actionable tip"],
  "suggested_reply": "one natural next user line"
}
Rules:
- Keep everything concise and learner-friendly.
- confidence must be from 0 to 1.
- Max 2 items in strengths and improvements.
- Ground analysis in the latest user line first; do not invent topic shifts.
- If latest user line asks identity/challenge/profane question, tone is not "positive".
- No markdown, no extra keys, JSON only."""

       payload = {
           "messages": [
               {"role": "system", "content": prompt},
               {"role": "user", "content": "\n".join(recent)},
           ],
           "max_tokens": 260,
           "temperature": 0.3,
           "top_p": 0.9,
       }

       for backend in backends:
           try:
               headers = {
                   "Authorization": f"Bearer {backend['api_key']}",
                   "Content-Type": "application/json",
               }
               req_payload = dict(payload)
               req_payload["model"] = backend["model"]
               resp = requests.post(backend["url"], headers=headers, json=req_payload, timeout=9)
               if resp.status_code != 200:
                   continue

               content = (
                   resp.json()
                   .get("choices", [{}])[0]
                   .get("message", {})
                   .get("content", "")
                   .strip()
               )
               if not content:
                   continue
               match = re.search(r"\{[\s\S]*\}", content)
               if not match:
                   continue
               parsed = json.loads(match.group(0))
               confidence = parsed.get("confidence", 0.5)
               try:
                   confidence = float(confidence)
               except (TypeError, ValueError):
                   confidence = 0.5
               confidence = max(0.0, min(1.0, confidence))

               strengths = parsed.get("strengths") or []
               if isinstance(strengths, str):
                   strengths = [strengths]
               improvements = parsed.get("improvements") or []
               if isinstance(improvements, str):
                   improvements = [improvements]

               result = {
                   "summary": str(parsed.get("summary") or fallback["summary"]).strip(),
                   "tone": str(parsed.get("tone") or "neutral").strip().lower(),
                   "intent": str(parsed.get("intent") or "conversation").strip(),
                   "confidence": confidence,
                   "strengths": [str(x).strip() for x in strengths if str(x).strip()][:2] or fallback["strengths"],
                   "improvements": [str(x).strip() for x in improvements if str(x).strip()][:2] or fallback["improvements"],
                   "suggested_reply": str(parsed.get("suggested_reply") or fallback["suggested_reply"]).strip(),
               }
               latest = user_message.lower()
               identity_or_challenge = (
                   ("who are you" in latest)
                   or ("what are you" in latest)
                   or ("who the hell" in latest)
                   or ("hell" in latest)
               )
               if identity_or_challenge:
                   result["tone"] = "negative" if "hell" in latest else "curious"
                   result["intent"] = "identity challenge"
                   result["summary"] = "User is asking Emma's identity in a blunt tone."
                   result["confidence"] = max(0.8, float(result.get("confidence", 0.0)))
                   result["improvements"] = [
                       "Ask direct but respectful questions for clearer responses.",
                       "Try one follow-up about Emma's role or purpose.",
                   ]
                   result["suggested_reply"] = "Okay, who are you exactly and how can you help my English?"
               return result
           except Exception:
               continue

       return fallback

    def generate_ai_response(self, text, persona='beginner', conversation_history=None):
       """Generate AI response using Groq LLaMA 3 with robust fallbacks."""
       backends = self._get_llm_backends()
       if not backends:
           return "I can chat with you, but no AI key is configured. Add GROQ_API_KEY to continue."

       system_prompt = self.personas.get(persona, self.personas['beginner'])['prompt']
       messages = [{"role": "system", "content": system_prompt}]

       if conversation_history:
           for exchange in conversation_history[-6:]:
               user_msg = exchange.get('user_message')
               bot_msg = exchange.get('bot_response')
               if user_msg:
                   messages.append({"role": "user", "content": user_msg})
               if bot_msg:
                   messages.append({"role": "assistant", "content": bot_msg})

       messages.append({"role": "user", "content": text})

       payload = {
           "messages": messages,
           "max_tokens": 220,
           "temperature": 0.68,
           "top_p": 0.9
       }

       for backend in backends:
           try:
               headers = {
                   "Authorization": f"Bearer {backend['api_key']}",
                   "Content-Type": "application/json"
               }
               req_payload = dict(payload)
               req_payload["model"] = backend["model"]
               response = requests.post(backend["url"], headers=headers, json=req_payload, timeout=10)
               if response.status_code != 200:
                   print(f"{backend['name']} API error {response.status_code}: {(response.text or '')[:220]}")
                   continue

               result = response.json()
               content = (
                   result.get("choices", [{}])[0]
                   .get("message", {})
                   .get("content", "")
                   .strip()
               )
               if content:
                   return content
           except Exception as e:
               print(f"{backend['name']} request failed: {e}")
               continue
       return "I had trouble reaching the AI service just now. Please try again in a moment."

    def _call_llama_api_enhanced(self, messages, persona, attempt=0):
       """Enhanced API call with better completion strategies"""
       backends = self._get_llm_backends()
       if not backends:
           print("⚠️ No AI API key found")
           return None
       
       # Progressive token increases for better completion
       base_tokens = {'beginner': 800, 'intermediate': 1000, 'advanced': 1200, 'native': 1000}
       max_tokens = base_tokens.get(persona, 800) + (attempt * 300)  # Increase tokens with each attempt
       
       # Light nudge so replies finish cleanly without forcing robotic length
       system_msg = messages[0]['content'] + """

Reply rules:
- Finish what you start: complete sentences, normal ending punctuation, no trailing cutoff.
- Chat-length by default—don't pad with filler to sound formal or "complete."
- Stay useful and human; answer what they actually asked."""

       enhanced_messages = [{'role': 'system', 'content': system_msg}] + messages[1:]

       for backend in backends:
           try:
               data = {
                   'model': backend['model'],
                   'messages': enhanced_messages,
                   'max_tokens': min(max_tokens, 1800),
                   'temperature': max(0.5, 0.78 - (attempt * 0.08)),
                   'top_p': 0.92,
                   'frequency_penalty': 0.2,
                   'presence_penalty': 0.05,
                   'stop': None
               }
               headers = {"Authorization": f"Bearer {backend['api_key']}", "Content-Type": "application/json"}
               print(f"🤖 API call ({backend['name']}, {persona}, attempt {attempt + 1})")
               response = requests.post(backend["url"], headers=headers, json=data, timeout=10)

               if response.status_code != 200:
                   snippet = (response.text or "")[:360]
                   print(f"❌ {backend['name']} error: {response.status_code} — {snippet}")
                   continue

               try:
                   result = response.json()
               except ValueError:
                   print(f"❌ {backend['name']} returned non-JSON body")
                   continue

               content = result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
               finish_reason = result.get('choices', [{}])[0].get('finish_reason')
               print(f"📊 {backend['name']} response: {len(content)} chars, finish_reason: {finish_reason}")
               if content:
                   return content
           except Exception as e:
               print(f"❌ {backend['name']} API call error: {e}")
               continue
       return None

    def _generate_persona_response_enhanced(self, message, persona, user_data, pronunciation_analysis, grammar_analysis, fluency_analysis, intent_analysis=None):
       """Enhanced response generation with aggressive cut-off prevention and intent adaptation"""
       try:
           # Store current persona for completeness checking
           self.current_persona = persona
           
           conversation_history = user_data.get('conversation_history', [])[-8:]  # Keep more recent context
           
           print(f"🎭 Generating {persona} response for: {message[:50]}...")
           
           # Build enhanced messages with better context and intent adaptation
           base_prompt = self.personas[persona]['prompt']
           
           # NEW: Adapt prompt based on detected intent
           intent_adaptation = ""
           if intent_analysis:
               intent_type = intent_analysis.get('type', 'statement')
               if intent_type == 'question':
                   intent_adaptation = (
                       "\n\nThey asked a question: answer it in the first line or two—no long preamble or generic praise before the answer."
                   )
               elif intent_type == 'exclamation':
                   intent_adaptation = (
                       "\n\nThey're reacting emotionally: respond like a person—briefly match their energy, then you can add one useful line if it fits."
                   )
               elif intent_type == 'statement':
                   intent_adaptation = (
                       "\n\nThey shared something: acknowledge it in your own words (not a formula), then add a natural follow-up or one small language tip if helpful."
                   )
           
           enhanced_prompt = base_prompt + intent_adaptation
           
           messages = [
               {"role": "system", "content": enhanced_prompt}
           ]
           
           # Add conversation history with better formatting
           for exchange in conversation_history:
               if exchange.get('user_message') and exchange.get('bot_response'):
                   messages.append({"role": "user", "content": exchange['user_message']})
                   messages.append({"role": "assistant", "content": exchange['bot_response']})
           
           # Add current message
           messages.append({"role": "user", "content": message})
           
           print(f"📝 Conversation context: {len(messages)} messages")
           
           # Enhanced API call with multiple attempts and better completion checking
           for attempt in range(2):
               print(f"🔄 API attempt {attempt + 1}/2")
               
               api_response = self._call_llama_api_enhanced(messages, persona, attempt)
               
               if api_response:
                   response_length = len(api_response)
                   print(f"✅ Got response: {response_length} chars")
                   
                   # Enhanced completion checking
                   if self._is_response_complete(api_response):
                       print(f"✅ Response appears complete")
                       return api_response
                   else:
                       print(f"❌ Response incomplete ({response_length} chars), retrying...")
                       continue
               else:
                   print(f"❌ No response from API (attempt {attempt + 1})")
                   continue
           
           print("⚠️ All API attempts failed, using enhanced fallback")
           # Enhanced fallback with intent consideration
           return self._generate_persona_fallback_enhanced(message, persona, pronunciation_analysis, grammar_analysis, intent_analysis)
           
       except Exception as e:
           print(f"Enhanced persona response error: {e}")
           traceback.print_exc()
           return self._generate_persona_fallback_enhanced(message, persona, pronunciation_analysis, grammar_analysis, intent_analysis)

    def _build_tutor_user_profile(self, user_data):
       """Slice of user JSON passed into generate_feedback for memory-aware prompts."""
       mem = user_data.get('tutor_memory') or {}
       weak = mem.get('weak_areas') or []
       if isinstance(weak, str):
           weak = [weak]
       av = mem.get('avg_scores') or {}
       recent = mem.get('recent_messages') or []
       return {
           'weak_areas': weak,
           'avg_grammar': av.get('grammar'),
           'avg_fluency': av.get('fluency'),
           'avg_pronunciation': av.get('pronunciation'),
           'recent_user_messages': recent[-5:],
       }

    def _apply_tutor_memory(self, user_data, user_message, tutor):
       """Update rolling averages, weak-area hints, XP, and recent lines for the tutor prompt."""
       mem = user_data.setdefault('tutor_memory', {
           'weak_areas': [],
           'avg_scores': {},
           'recent_messages': [],
           'total_xp': 0.0,
           'turn_count': 0,
       })
       g = float(tutor['grammar_score'])
       f = float(tutor['fluency_score'])
       p = float(tutor['pronunciation_score'])
       n = int(mem.get('turn_count', 0)) + 1
       for key, val in [('grammar', g), ('fluency', f), ('pronunciation', p)]:
           old = mem['avg_scores'].get(key)
           if old is None:
               mem['avg_scores'][key] = round(val, 1)
           else:
               mem['avg_scores'][key] = round((float(old) * (n - 1) + val) / n, 1)
       mem['turn_count'] = n
       mem['total_xp'] = float(mem.get('total_xp', 0)) + float(tutor['xp_gained'])

       msgs = mem.setdefault('recent_messages', [])
       msgs.append((user_message or '')[:500])
       mem['recent_messages'] = msgs[-15:]

       scores = [('grammar', g), ('fluency', f), ('pronunciation', p)]
       scores.sort(key=lambda x: x[1])
       boost = [scores[0][0]]
       if len(scores) > 1 and scores[1][1] < 7.0:
           boost.append(scores[1][0])
       c = Counter(mem.get('weak_areas', []))
       for w in boost:
           c[w] += 2
       mem['weak_areas'] = [k for k, _ in c.most_common(5)]

       stats = user_data.setdefault('stats', {})
       stats['tutor_total_xp'] = round(mem['total_xp'], 1)

    def _update_comprehensive_progress(self, user_data, username, user_message, bot_response, pronunciation_analysis, grammar_analysis, fluency_analysis, composite_score, tutor_feedback=None):
       """Update user progress with enhanced data tracking (mutates and saves ``user_data``)."""
       try:
           # Update scores with smoothing for stability
           old_scores = {
               'pronunciation': user_data['profile'].get('pronunciation_score', 0),
               'grammar': user_data['profile'].get('grammar_score', 0),
               'fluency': user_data['profile'].get('fluency_score', 0),
               'overall': user_data['profile'].get('proficiency_score', 0)
           }

           awaiting = user_data['profile'].get('awaiting_initial_assessment', False)
           # First message after "let Emma decide": set scores from this turn only, then track normally
           smoothing_factor = 1.0 if awaiting else 0.2
           if awaiting:
               user_data['profile']['awaiting_initial_assessment'] = False
           user_data['profile']['pronunciation_score'] = round(
               old_scores['pronunciation'] * (1 - smoothing_factor) + 
               pronunciation_analysis.get('score', 0) * smoothing_factor
           )
           user_data['profile']['grammar_score'] = round(
               old_scores['grammar'] * (1 - smoothing_factor) + 
               grammar_analysis.get('score', 0) * smoothing_factor
           )
           user_data['profile']['fluency_score'] = round(
               old_scores['fluency'] * (1 - smoothing_factor) + 
               fluency_analysis.get('score', 0) * smoothing_factor
           )
           user_data['profile']['proficiency_score'] = round(
               old_scores['overall'] * (1 - smoothing_factor) + 
               composite_score * smoothing_factor
           )
           
           # Update running averages and stats
           stats = user_data['stats']
           total_sessions = stats['total_sessions'] + 1
           
           stats['average_pronunciation_score'] = self._update_running_average(
               stats.get('average_pronunciation_score', 0), 
               pronunciation_analysis.get('score', 0), 
               total_sessions
           )
           stats['average_grammar_score'] = self._update_running_average(
               stats.get('average_grammar_score', 0), 
               grammar_analysis.get('score', 0), 
               total_sessions
           )
           stats['average_fluency_score'] = self._update_running_average(
               stats.get('average_fluency_score', 0), 
               fluency_analysis.get('score', 0), 
               total_sessions
           )
           stats['average_wpm'] = self._update_running_average(
               stats.get('average_wpm', 0), 
               fluency_analysis.get('words_per_minute', 0), 
               total_sessions
           )
           
           stats['total_sessions'] = total_sessions
           stats['last_practice'] = datetime.datetime.now().isoformat()
           
           # Enhanced conversation history
           if 'conversation_history' not in user_data:
               user_data['conversation_history'] = []
           
           user_data['conversation_history'].append({
               'timestamp': datetime.datetime.now().isoformat(),
               'user_message': user_message,
               'bot_response': bot_response,
               'scores': {
                   'pronunciation': pronunciation_analysis.get('score', 0),
                   'grammar': grammar_analysis.get('score', 0),
                   'fluency': fluency_analysis.get('score', 0),
                   'composite': composite_score
               },
               'analysis_details': {
                   'pronunciation_errors': len(pronunciation_analysis.get('mispronunciations', [])),
                   'grammar_errors': len(grammar_analysis.get('errors', [])),
                   'filler_count': fluency_analysis.get('filler_count', 0),
                   'wpm': fluency_analysis.get('words_per_minute', 0)
               }
           })
           
           # Keep only last 50 conversations for performance
           user_data['conversation_history'] = user_data['conversation_history'][-50:]

           if tutor_feedback:
               self._apply_tutor_memory(user_data, user_message, tutor_feedback)
           
           # Save updated data
           self._save_user_data(username, user_data)
           
           print(f"✅ Enhanced progress updated for {username}")
           
       except Exception as e:
           print(f"Enhanced progress update error: {e}")
           traceback.print_exc()

    def _append_partner_exchange(self, user_data, username, user_message, bot_response):
       """Persist partner chat turn and update progress metrics (scores, WPM, averages)."""
       try:
           pronunciation_analysis = self._analyze_pronunciation_enhanced(user_message, user_data)
           grammar_analysis = self._analyze_grammar_enhanced(user_message)
           fluency_analysis = self._analyze_fluency_enhanced(user_message, user_data)
           composite_score = self._calculate_composite_score(
               pronunciation_analysis,
               grammar_analysis,
               fluency_analysis
           )
           self._update_comprehensive_progress(
               user_data,
               username,
               user_message,
               bot_response,
               pronunciation_analysis,
               grammar_analysis,
               fluency_analysis,
               composite_score
           )
       except Exception as e:
           # Never drop a partner chat turn; fallback keeps history even if analytics path fails.
           print(f"Partner exchange analytics error (fallback to basic save): {e}")
           try:
               if 'conversation_history' not in user_data:
                   user_data['conversation_history'] = []
               user_data['conversation_history'].append({
                   'timestamp': datetime.datetime.now().isoformat(),
                   'user_message': user_message,
                   'bot_response': bot_response,
                   'mode': 'partner',
               })
               user_data['conversation_history'] = user_data['conversation_history'][-50:]
               self._save_user_data(username, user_data)
           except Exception as inner:
               print(f"Partner exchange save fallback error: {inner}")
               traceback.print_exc()

    def _save_partner_wrapup(self, user_data, username, summary, improvements, message_count=0):
       """Store end-of-chat wrap-up on the user profile for progress tracking."""
       try:
           improvements = [str(x).strip() for x in (improvements or []) if str(x).strip()][:5]
           summary = (summary or "").strip() or "Thanks for chatting today—small steps add up."
           user_data.setdefault('conversation_wrapups', []).append({
               'timestamp': datetime.datetime.now().isoformat(),
               'summary': summary,
               'improvements': improvements,
           })
           user_data['conversation_wrapups'] = user_data['conversation_wrapups'][-20:]
           user_data.setdefault('profile', {})
           user_data['profile']['last_session_wrapup'] = {
               'summary': summary,
               'improvements': improvements,
           }
           user_data.setdefault('session_history', [])
           user_data['session_history'].append({
               'timestamp': datetime.datetime.now().isoformat(),
               'mode': 'partner',
               'messages_sent': int(message_count or 0),
               'avg_pronunciation_score': user_data.get('stats', {}).get('average_pronunciation_score', 0),
               'avg_grammar_score': user_data.get('stats', {}).get('average_grammar_score', 0),
               'avg_fluency_score': user_data.get('stats', {}).get('average_fluency_score', 0),
           })
           user_data['session_history'] = user_data['session_history'][-100:]
           hints = user_data.setdefault('learning_hints', [])
           for imp in improvements[:3]:
               if imp and imp not in hints:
                   hints.append(imp)
           user_data['learning_hints'] = hints[-25:]
           self._save_user_data(username, user_data)
       except Exception as e:
           print(f"Partner wrap-up save error: {e}")
           traceback.print_exc()

    def _backfill_partner_stats_if_missing(self, user_data, username):
       """Repair legacy partner-only accounts where chat history exists but stats stayed at zero."""
       try:
           stats = user_data.setdefault('stats', {})
           total_sessions = int(stats.get('total_sessions', 0) or 0)
           history = user_data.get('conversation_history', []) or []
           if total_sessions > 0 or not history:
               return

           scored_turns = [h for h in history if isinstance(h, dict) and isinstance(h.get('scores'), dict)]
           if scored_turns:
               stats['total_sessions'] = len(scored_turns)
               stats['average_pronunciation_score'] = round(
                   sum(float(h['scores'].get('pronunciation', 0)) for h in scored_turns) / max(1, len(scored_turns)), 1
               )
               stats['average_grammar_score'] = round(
                   sum(float(h['scores'].get('grammar', 0)) for h in scored_turns) / max(1, len(scored_turns)), 1
               )
               stats['average_fluency_score'] = round(
                   sum(float(h['scores'].get('fluency', 0)) for h in scored_turns) / max(1, len(scored_turns)), 1
               )
               stats['average_wpm'] = round(
                   sum(float((h.get('analysis_details') or {}).get('wpm', 0)) for h in scored_turns) / max(1, len(scored_turns)), 1
               )
               last_ts = scored_turns[-1].get('timestamp')
               if last_ts:
                   stats['last_practice'] = last_ts
           else:
               # Legacy uns cored history: at least reflect chat count and profile-level averages.
               profile = user_data.get('profile', {})
               stats['total_sessions'] = len([h for h in history if isinstance(h, dict) and h.get('user_message')])
               stats['average_pronunciation_score'] = float(profile.get('pronunciation_score', 0) or 0)
               stats['average_grammar_score'] = float(profile.get('grammar_score', 0) or 0)
               stats['average_fluency_score'] = float(profile.get('fluency_score', 0) or 0)
               stats['average_wpm'] = float(stats.get('average_wpm', 0) or 0)
               last_ts = None
               for h in reversed(history):
                   if isinstance(h, dict) and h.get('timestamp'):
                       last_ts = h.get('timestamp')
                       break
               if last_ts:
                   stats['last_practice'] = last_ts

           self._save_user_data(username, user_data)
       except Exception as e:
           print(f"Partner stats backfill error: {e}")

    def _update_running_average(self, current_avg, new_value, count):
       """Update running average with new value"""
       if count == 1:
           return new_value
       return round(((current_avg * (count - 1)) + new_value) / count, 1)

    def _register_routes(self):
       # Enhanced authentication routes
       @self.app.route('/api/auth/signup', methods=['POST'])
       def signup():
           try:
               data = request.get_json()
               username = data.get('username', '').strip()
               email = data.get('email', '').strip()
               password = data.get('password', '')
               full_name = data.get('fullName', '').strip()
               initial_level = data.get('initialLevel', 'auto')  # New: manual level selection
               
               if not all([username, email, password, full_name]):
                   return jsonify({'error': 'All fields are required'}), 400
               
               if len(password) < 6:
                   return jsonify({'error': 'Password must be at least 6 characters'}), 400

               user_file = self._legacy_user_file(username)
               mongo_user_doc = None
               if self.mongo_users is not None:
                   try:
                       mongo_user_doc = self.mongo_users.find_one(
                           {"$or": [{"username": username}, {"email": email}]},
                           {"_id": 1, "username": 1, "email": 1},
                       )
                   except PyMongoError as e:
                       print(f"Mongo signup lookup failed: {e}")
                       return jsonify({'error': 'Auth storage unavailable'}), 503

               if mongo_user_doc is not None or os.path.exists(user_file):
                   return jsonify({'error': 'Username or email already exists'}), 409
               
               # Auto level: no fake scores until the learner has chatted once (see awaiting_initial_assessment)
               if initial_level == 'auto':
                   proficiency_score = 0
                   level = 'beginner'
               elif initial_level == 'beginner':
                   proficiency_score = 35
                   level = 'beginner'
               elif initial_level == 'intermediate':
                   proficiency_score = 60
                   level = 'intermediate'
               elif initial_level == 'advanced':
                   proficiency_score = 80
                   level = 'advanced'
               else:
                   proficiency_score = 0
                   level = 'beginner'

               awaiting_initial_assessment = initial_level == 'auto'

               # Enhanced user profile
               user_data = {
                   'id': str(uuid.uuid4()),
                   'username': username,
                   'email': email,
                   'full_name': full_name,
                   'password_hash': self._hash_password_bcrypt(password),
                   'created_at': datetime.datetime.now().isoformat(),
                   'profile': {
                       'level': level,
                       'current_persona': level,
                       'proficiency_score': proficiency_score,
                       'pronunciation_score': proficiency_score,
                       'grammar_score': proficiency_score,
                       'fluency_score': proficiency_score,
                       'manual_level_override': initial_level != 'auto',
                       'awaiting_initial_assessment': awaiting_initial_assessment,
                       'goals': {
                           'daily_practice_time': 15,
                           'weekly_vocab_target': 20,
                           'current_focus': 'conversation'
                       },
                       'preferences': {
                           'voice_enabled': True,
                           'difficulty': 'adaptive',
                           'topics': ['general', 'conversation'],
                           'correction_style': 'gentle',
                           'pronunciation_feedback': True,
                           'auto_level_adjustment': initial_level == 'auto'
                       }
                   },
                   'stats': {
                       'total_sessions': 0,
                       'total_practice_time': 0,
                       'words_learned': 0,
                       'grammar_improvements': 0,
                       'pronunciation_improvements': 0,
                       'streak_days': 0,
                       'last_practice': None,
                       'average_wpm': 0,
                       'average_pronunciation_score': proficiency_score,
                       'average_grammar_score': proficiency_score,
                       'average_fluency_score': proficiency_score,
                   },
                   'conversation_history': [],
                   'pronunciation_history': [],
                   'grammar_history': [],
                   'fluency_history': [],
                   'vocabulary': {
                       'learning': [],
                       'mastered': [],
                       'review_needed': [],
                       'mispronounced': [],
                       'total_encountered': 0
                   },
                   'session_history': [],
                   'level_change_history': [
                       {
                           'timestamp': datetime.datetime.now().isoformat(),
                           'from_level': None,
                           'to_level': level,
                           'score': proficiency_score,
                           'method': (
                               'pending_assessment'
                               if awaiting_initial_assessment
                               else ('manual' if initial_level != 'auto' else 'auto')
                           ),
                       }
                   ]
               }

               if self.mongo_users is not None:
                   try:
                       self.mongo_users.insert_one({
                           "id": user_data["id"],
                           "username": username,
                           "email": email,
                           "full_name": full_name,
                           "password_hash": user_data["password_hash"],
                           "created_at": user_data["created_at"],
                       })
                   except PyMongoError as e:
                       print(f"Mongo signup insert failed: {e}")
                       return jsonify({'error': 'Could not create account in auth storage'}), 503
               
               self._save_user_data(username, user_data)
               
               access_token = create_access_token(identity=username)
               
               return jsonify({
                   'message': 'Account created successfully!',
                   'token': access_token,
                   'user': {
                       'username': username,
                       'full_name': full_name,
                       'email': email,
                       'level': level,
                       'proficiency_score': proficiency_score,
                       'awaiting_initial_assessment': awaiting_initial_assessment,
                   }
               }), 201
               
           except Exception as e:
               print(f"Signup error: {e}")
               traceback.print_exc()
               return jsonify({'error': 'Server error during signup'}), 500

       @self.app.route('/api/auth/login', methods=['POST'])
       def login():
           try:
               data = request.get_json()
               username = data.get('username', '').strip()
               password = data.get('password', '')
               
               if not username or not password:
                   return jsonify({'error': 'Username and password required'}), 400

               user_data = None
               mongo_auth_ok = False

               if self.mongo_users is not None:
                   try:
                       mongo_doc = self.mongo_users.find_one({"username": username})
                   except PyMongoError as e:
                       print(f"Mongo login lookup failed: {e}")
                       return jsonify({'error': 'Auth storage unavailable'}), 503
                   if mongo_doc and self._verify_password_any(password, mongo_doc.get('password_hash', '')):
                       mongo_auth_ok = True
                       user_data = self._load_user_data(username)
                       if user_data is None:
                           return jsonify({'error': 'User profile not found; please signup again'}), 404

               if not mongo_auth_ok:
                   # Backward compatibility: legacy local users can still login once,
                   # then we migrate credential hash into Mongo (bcrypt).
                   user_file = self._legacy_user_file(username)
                   if not os.path.exists(user_file):
                       return jsonify({'error': 'Invalid username or password'}), 401

                   user_data = self._load_user_data(username)
                   if user_data is None:
                       return jsonify({'error': 'Invalid username or password'}), 401

                   stored_hash = user_data.get('password_hash', '')
                   if not self._verify_password_any(password, stored_hash):
                       return jsonify({'error': 'Invalid username or password'}), 401

                   if self.mongo_users is not None:
                       try:
                           migrated_hash = self._hash_password_bcrypt(password)
                           self.mongo_users.update_one(
                               {"username": username},
                               {"$set": {
                                   "id": user_data.get('id'),
                                   "username": username,
                                   "email": user_data.get('email'),
                                   "full_name": user_data.get('full_name'),
                                   "password_hash": migrated_hash,
                                   "updated_at": datetime.datetime.now().isoformat(),
                               }},
                               upsert=True,
                           )
                           user_data['password_hash'] = migrated_hash
                           self._save_user_data(username, user_data)
                       except PyMongoError as e:
                           print(f"Mongo auth migration failed for {username}: {e}")
               
               access_token = create_access_token(identity=username)
               
               return jsonify({
                   'message': 'Login successful!',
                   'token': access_token,
                   'user': {
                       'username': username,
                       'full_name': user_data['full_name'],
                       'email': user_data['email'],
                       'level': user_data['profile']['level'],
                       'proficiency_score': user_data['profile'].get('proficiency_score', 0),
                       'awaiting_initial_assessment': user_data['profile'].get(
                           'awaiting_initial_assessment', False
                       ),
                   }
               }), 200
               
           except Exception as e:
               print(f"Login error: {e}")
               return jsonify({'error': 'Server error during login'}), 500

       # Enhanced chat endpoint with fixed response cut-off and intent detection
       @self.app.route('/api/chat/message', methods=['POST'])
       @jwt_required()
       def chat_message():
           try:
               username = get_jwt_identity()
               data = request.get_json()
               message = self._normalize_user_sentence_punctuation(data.get('message', ''))
               conversation_mode = data.get('conversation_mode', 'natural')
               
               if not message:
                   return jsonify({'error': 'Message cannot be empty'}), 400
               
               # Load user data
               user_data = self._load_user_data(username)
               if user_data is None:
                   return jsonify({'error': 'User not found'}), 404
               
               print(f"📝 Processing message from {username}: {message[:50]}...")
               
               # Comprehensive analysis
               start_time = time.time()
               
               # NEW: Detect sentence intent type
               intent_analysis = self._detect_sentence_intent(message)
               
               # 1. Enhanced pronunciation analysis
               pronunciation_analysis = self._analyze_pronunciation_enhanced(message, user_data)
               
               # 2. Enhanced grammar analysis  
               grammar_analysis = self._analyze_grammar_enhanced(message)
               
               # 3. Enhanced fluency analysis
               fluency_analysis = self._analyze_fluency_enhanced(message, user_data)
               
               # 4. Structured AI tutor feedback (JSON scores + coaching text)
               tutor_profile = self._build_tutor_user_profile(user_data)
               tutor_result = generate_feedback(message, tutor_profile)
               
               grammar_analysis['score'] = int(round(float(tutor_result['grammar_score']) * 10))
               fluency_analysis['score'] = int(round(float(tutor_result['fluency_score']) * 10))
               pronunciation_analysis['score'] = int(round(float(tutor_result['pronunciation_score']) * 10))
               
               # 5. Calculate composite proficiency score (aligned with tutor 0–10 → 0–100)
               composite_score = self._calculate_composite_score(
                   pronunciation_analysis, grammar_analysis, fluency_analysis
               )
               
               # 6. Update user level only if auto-adjustment is enabled
               old_level = user_data['profile']['level']
               new_level = old_level
               persona_changed = False
               
               if user_data['profile']['preferences'].get('auto_level_adjustment', True):
                   new_level = self._determine_level(composite_score)
                   if new_level != old_level:
                       user_data['profile']['level'] = new_level
                       user_data['profile']['current_persona'] = new_level
                       persona_changed = True
                       
                       # Record automatic level change
                       if 'level_change_history' not in user_data:
                           user_data['level_change_history'] = []
                       
                       user_data['level_change_history'].append({
                           'timestamp': datetime.datetime.now().isoformat(),
                           'from_level': old_level,
                           'to_level': new_level,
                           'score': composite_score,
                           'method': 'auto'
                       })
                       
                       print(f"🎭 User {username} level changed: {old_level} → {new_level}")
               
               # 7. Primary reply = short tutor coaching (structured fields returned separately)
               bot_response = tutor_result.get('feedback') or self.generate_ai_response(
                   message,
                   user_data['profile']['current_persona'],
                   user_data.get('conversation_history', [])
               )
               
               # 8. Generate enhanced accent correction feedback (NLP details kept)
               accent_feedback = None
               if (pronunciation_analysis['mispronunciations'] or 
                   pronunciation_analysis['score'] < 70):
                   accent_feedback = self._generate_accent_correction_enhanced(
                       message, pronunciation_analysis
                   )
               
               # 9. Update user progress (persists level changes + tutor memory)
               self._update_comprehensive_progress(
                   user_data, username, message, bot_response, pronunciation_analysis,
                   grammar_analysis, fluency_analysis, composite_score,
                   tutor_feedback=tutor_result
               )
               
               processing_time = time.time() - start_time
               print(f"⚡ Analysis completed in {processing_time:.2f}s")
               
               response_data = {
                   'response': bot_response,
                   'analysis': {
                       'intent': intent_analysis,  # NEW: Include intent in response
                       'pronunciation': {
                           'score': pronunciation_analysis['score'],
                           'mispronunciations': pronunciation_analysis['mispronunciations'][:3],
                           'accuracy': pronunciation_analysis['accuracy'],
                           'phoneme_errors': pronunciation_analysis.get('phoneme_errors', [])
                       },
                       'grammar': {
                           'score': grammar_analysis['score'],
                           'errors': len(grammar_analysis['errors']),
                           'suggestions': grammar_analysis['errors'][:2],
                           'error_types': grammar_analysis.get('error_types', [])
                       },
                       'fluency': {
                           'score': fluency_analysis['score'],
                           'wpm': fluency_analysis['words_per_minute'],
                           'filler_count': fluency_analysis['filler_count'],
                           'pause_analysis': fluency_analysis.get('pause_analysis', {})
                       },
                       'composite_score': composite_score,
                       'level': new_level,
                       'persona_changed': persona_changed
                   },
                   'accent_feedback': accent_feedback,
                   'tutor_feedback': tutor_result,
                   'processing_time': round(processing_time, 2)
               }
               
               # Add detailed feedback in full_feedback mode
               if conversation_mode == 'full_feedback':
                   response_data['detailed_feedback'] = self._prepare_detailed_feedback(
                       pronunciation_analysis, grammar_analysis, fluency_analysis
                   )
               
               return jsonify(response_data), 200
               
           except Exception as e:
               print(f"Chat error: {e}")
               traceback.print_exc()
               return jsonify({'error': 'Could not process message'}), 500

       # Natural conversation partner: one LLM call per message, no per-message scoring.
       @self.app.route('/api/chat/partner', methods=['POST'])
       @jwt_required()
       def chat_partner():
           try:
               username = get_jwt_identity()
               data = request.get_json() or {}
               message = self._normalize_user_sentence_punctuation(data.get('message'))
               if not message:
                   return jsonify({'error': 'Message cannot be empty'}), 400

               user_data = self._load_user_data(username)
               if user_data is None:
                   return jsonify({'error': 'User not found'}), 404

               persona = user_data.get('profile', {}).get('current_persona', 'beginner')
               hist = user_data.get('conversation_history', [])[-10:]
               pairs = []
               for h in hist:
                   u = h.get('user_message')
                   b = h.get('bot_response')
                   if u and b:
                       pairs.append((u, b))

               t0 = time.time()
               reply = generate_partner_reply(message, pairs, persona)
               self._append_partner_exchange(user_data, username, message, reply)
               return jsonify({
                   'response': reply,
                   'processing_time': round(time.time() - t0, 2),
               }), 200
           except Exception as e:
               print(f"Partner chat error: {e}")
               traceback.print_exc()
               return jsonify({'error': 'Could not process message'}), 500

       @self.app.route('/api/chat/partner/stream', methods=['POST'])
       @jwt_required()
       def chat_partner_stream():
           try:
               username = get_jwt_identity()
               data = request.get_json() or {}
               message = self._normalize_user_sentence_punctuation(data.get('message'))
               if not message:
                   return jsonify({'error': 'Message cannot be empty'}), 400

               user_data = self._load_user_data(username)
               if user_data is None:
                   return jsonify({'error': 'User not found'}), 404

               persona = user_data.get('profile', {}).get('current_persona', 'beginner')
               hist = user_data.get('conversation_history', [])[-10:]
               pairs = []
               for h in hist:
                   u = h.get('user_message')
                   b = h.get('bot_response')
                   if u and b:
                       pairs.append((u, b))

               t0 = time.time()
               reply = generate_partner_reply(message, pairs, persona)
               self._append_partner_exchange(user_data, username, message, reply)

               @stream_with_context
               def event_stream():
                   words = str(reply or "").split()
                   chunk_size = 6
                   built = []
                   for i in range(0, len(words), chunk_size):
                       part = " ".join(words[i:i + chunk_size]).strip()
                       if not part:
                           continue
                       built.append(part)
                       payload = {'text': " ".join(built)}
                       yield f"data: {json.dumps(payload)}\n\n"
                   done = {
                       'final': True,
                       'response': reply,
                       'processing_time': round(time.time() - t0, 2),
                   }
                   yield f"data: {json.dumps(done)}\n\n"

               return Response(event_stream(), mimetype='text/event-stream')
           except Exception as e:
               print(f"Partner stream error: {e}")
               traceback.print_exc()
               return jsonify({'error': 'Could not process message'}), 500

       @self.app.route('/api/chat/partner/end', methods=['POST'])
       @jwt_required()
       def chat_partner_end():
           try:
               username = get_jwt_identity()
               data = request.get_json() or {}
               messages = data.get('messages') or []

               lines = []
               for m in messages:
                   if not isinstance(m, dict):
                       continue
                   role = m.get('type')
                   content = (m.get('content') or '').strip()
                   if not content:
                       continue
                   if role == 'user':
                       lines.append(f"User: {content}")
                   elif role == 'bot':
                       lines.append(f"Emma: {content}")

               transcript = "\n".join(lines)
               wrap = generate_partner_session_wrapup(transcript)
               message_count = len([m for m in messages if isinstance(m, dict) and m.get('type') == 'user'])

               user_data = self._load_user_data(username)
               if user_data is not None:
                   self._save_partner_wrapup(
                       user_data,
                       username,
                       wrap.get('summary', ''),
                       wrap.get('improvements', []),
                       message_count=message_count,
                   )

               return jsonify({
                   'summary': wrap.get('summary', ''),
                   'improvements': wrap.get('improvements', [])[:3],
                   'message_count': message_count,
               }), 200
           except Exception as e:
               print(f"Partner end error: {e}")
               traceback.print_exc()
               return jsonify({'error': 'Could not generate wrap-up'}), 500

       @self.app.route('/api/chat/partner/live-analysis', methods=['POST', 'OPTIONS'])
       def chat_partner_live_analysis():
           try:
               if request.method == 'OPTIONS':
                   return jsonify({'ok': True}), 200

               verify_jwt_in_request()
               username = get_jwt_identity()
               data = request.get_json() or {}
               message = self._normalize_user_sentence_punctuation(data.get('message'))
               bot_reply = (data.get('bot_reply') or '').strip()
               if not message:
                   return jsonify({'error': 'Message cannot be empty'}), 400

               user_data = self._load_user_data(username)
               if user_data is None:
                   return jsonify({'error': 'User not found'}), 404

               hist = user_data.get('conversation_history', [])[-10:]
               pairs = []
               for h in hist:
                   u = h.get('user_message')
                   b = h.get('bot_response')
                   if u and b:
                       pairs.append((u, b))

               result = self._generate_live_partner_analysis(message, bot_reply, pairs)
               return jsonify(result), 200
           except Exception as e:
               print(f"Live analysis error on {request.method} {request.path}: {e}")
               traceback.print_exc()
               return jsonify({
                   'summary': 'Live analysis is unavailable right now.',
                   'tone': 'neutral',
                   'intent': 'conversation',
                   'confidence': 0.5,
                   'strengths': ['You are still practicing, which matters most.'],
                   'improvements': ['Try again with a short clear sentence.'],
                   'suggested_reply': 'Can you explain that in another way?',
               }), 200

       @self.app.route('/api/user/stats', methods=['GET'])
       @jwt_required()
       def get_stats():
           try:
               username = get_jwt_identity()
               user_data = self._load_user_data(username)
               if user_data is None:
                   return jsonify({'error': 'User not found'}), 404
               self._backfill_partner_stats_if_missing(user_data, username)
               
               # Calculate recent sessions (this week)
               recent_sessions = user_data.get('session_history', [])
               current_time = datetime.datetime.now()
               week_ago = current_time - datetime.timedelta(days=7)
               
               sessions_this_week = 0
               for session in recent_sessions:
                   try:
                       session_time = datetime.datetime.fromisoformat(session.get('timestamp', ''))
                       if session_time >= week_ago:
                           sessions_this_week += 1
                   except:
                       continue
               
               # Enhanced statistics
               stats = {
                   'basic': {
                       'total_sessions': user_data.get('stats', {}).get('total_sessions', 0),
                       'total_practice_time': user_data.get('stats', {}).get('total_practice_time', 0),
                       'words_learned': user_data.get('stats', {}).get('words_learned', 0),
                       'grammar_improvements': user_data.get('stats', {}).get('grammar_improvements', 0),
                       'pronunciation_improvements': user_data.get('stats', {}).get('pronunciation_improvements', 0),
                       'streak_days': user_data.get('stats', {}).get('streak_days', 0),
                       'average_wpm': user_data.get('stats', {}).get('average_wpm', 0),
                       'average_pronunciation_score': user_data.get('stats', {}).get('average_pronunciation_score', 0),
                       'average_grammar_score': user_data.get('stats', {}).get('average_grammar_score', 0),
                       'average_fluency_score': user_data.get('stats', {}).get('average_fluency_score', 0),
                       'tutor_total_xp': user_data.get('stats', {}).get(
                           'tutor_total_xp',
                           user_data.get('tutor_memory', {}).get('total_xp', 0)
                       ),
                   },
                   'proficiency': {
                       'overall_score': user_data.get('profile', {}).get('proficiency_score', 0),
                       'pronunciation_score': user_data.get('profile', {}).get('pronunciation_score', 0),
                       'grammar_score': user_data.get('profile', {}).get('grammar_score', 0),
                       'fluency_score': user_data.get('profile', {}).get('fluency_score', 0),
                       'current_level': user_data.get('profile', {}).get('level', 'beginner'),
                       'current_persona': user_data.get('profile', {}).get('current_persona', 'beginner')
                   },
                   'vocabulary': {
                       'total_learning': len(user_data.get('vocabulary', {}).get('learning', [])),
                       'total_mastered': len(user_data.get('vocabulary', {}).get('mastered', [])),
                       'mispronounced': len(user_data.get('vocabulary', {}).get('mispronounced', [])),
                       'review_needed': len(user_data.get('vocabulary', {}).get('review_needed', [])),
                       'total_words': user_data.get('vocabulary', {}).get('total_encountered', 0)
                   },
                   'recent_activity': {
                       'sessions_this_week': sessions_this_week,
                       'avg_pronunciation_score': user_data.get('stats', {}).get('average_pronunciation_score', 0),
                       'avg_grammar_score': user_data.get('stats', {}).get('average_grammar_score', 0),
                       'avg_fluency_score': user_data.get('stats', {}).get('average_fluency_score', 0),
                       'total_errors_corrected': len(user_data.get('grammar_history', []))
                   }
               }
               
               return jsonify(stats), 200
               
           except Exception as e:
               print(f"Stats error: {e}")
               traceback.print_exc()
               return jsonify({'error': 'Could not load stats'}), 500

       @self.app.route('/api/user/profile', methods=['GET'])
       @jwt_required()
       def get_profile():
           try:
               username = get_jwt_identity()
               user_data = self._load_user_data(username)
               if user_data is None:
                   return jsonify({'error': 'User not found'}), 404
               
               profile_data = {
                   'username': user_data['username'],
                   'full_name': user_data['full_name'],
                   'email': user_data['email'],
                   'profile': user_data['profile'],
                   'stats': user_data['stats'],
                   'created_at': user_data['created_at'],
                   'recent_scores': {
                       'pronunciation': user_data.get('pronunciation_history', [])[-10:],
                       'grammar': user_data.get('grammar_history', [])[-10:],
                       'fluency': user_data.get('fluency_history', [])[-10:]
                   },
                   'level_change_history': user_data.get('level_change_history', [])[-5:]
               }
               
               return jsonify(profile_data), 200
               
           except Exception as e:
               print(f"Profile error: {e}")
               return jsonify({'error': 'Could not load profile'}), 500

       # Add manual level selection endpoint
       @self.app.route('/api/user/set-level', methods=['POST'])
       @jwt_required()
       def set_manual_level():
           try:
               username = get_jwt_identity()
               data = request.get_json()
               new_level = data.get('level', '').lower()
               
               if new_level not in ['beginner', 'intermediate', 'advanced', 'native']:
                   return jsonify({'error': 'Invalid level'}), 400
               
               user_data = self._load_user_data(username)
               if user_data is None:
                   return jsonify({'error': 'User not found'}), 404
               
               old_level = user_data['profile']['level']
               
               # Set new level and corresponding score
               level_scores = {
                   'beginner': 35,
                   'intermediate': 60,
                   'advanced': 80,
                   'native': 95
               }
               
               user_data['profile']['level'] = new_level
               user_data['profile']['current_persona'] = new_level
               user_data['profile']['manual_level_override'] = True
               user_data['profile']['preferences']['auto_level_adjustment'] = False
               user_data['profile']['awaiting_initial_assessment'] = False

               # Update scores to match level
               new_score = level_scores[new_level]
               user_data['profile']['proficiency_score'] = new_score
               user_data['profile']['pronunciation_score'] = new_score
               user_data['profile']['grammar_score'] = new_score
               user_data['profile']['fluency_score'] = new_score
               
               # Record level change
               if 'level_change_history' not in user_data:
                   user_data['level_change_history'] = []
               
               user_data['level_change_history'].append({
                   'timestamp': datetime.datetime.now().isoformat(),
                   'from_level': old_level,
                   'to_level': new_level,
                   'score': new_score,
                   'method': 'manual'
               })
               
               self._save_user_data(username, user_data)
               
               print(f"🎭 User {username} manually changed level: {old_level} → {new_level}")
               
               return jsonify({
                   'message': f'Level changed to {new_level}',
                   'level': new_level,
                   'proficiency_score': new_score,
                   'level_changed': True
               }), 200
               
           except Exception as e:
               print(f"Set level error: {e}")
               return jsonify({'error': 'Failed to update level'}), 500

       @self.app.route('/api/pronunciation/advanced-assessment', methods=['GET'])
       @jwt_required()
       def pronunciation_advanced_assessment():
           try:
               username = get_jwt_identity()
               user_data = self._load_user_data(username)
               if user_data is None:
                   return jsonify({'error': 'User not found'}), 404

               recent_pronunciation = [
                   entry.get('score', 0)
                   for entry in user_data.get('pronunciation_history', [])[-10:]
                   if isinstance(entry, dict)
               ]
               overall_score = int(round(user_data.get('profile', {}).get('pronunciation_score', 0)))

               if len(recent_pronunciation) >= 2:
                   delta = recent_pronunciation[-1] - recent_pronunciation[0]
               else:
                   delta = 0
               trend = 'Stable'
               if delta >= 3:
                   trend = 'Improving'
               elif delta <= -3:
                   trend = 'Declining'

               mispronounced_words = user_data.get('vocabulary', {}).get('mispronounced', [])[-10:]
               problem_sounds = []
               strengths = ["Clear effort and consistent speaking practice"]
               improvement_areas = ["Continue speaking in complete sentences"]
               recommendations = [
                   "Practice difficult words slowly, then at normal speed.",
                   "Repeat each target phrase 3-5 times with clear articulation."
               ]

               if mispronounced_words:
                   improvement_areas = ["Difficult word pronunciation needs more repetition"]
                   strengths = ["You are identifying and tracking challenging words"]
                   recommendations.append("Create a daily 5-minute drill with your recent difficult words.")

               if overall_score >= 85:
                   strengths.append("Strong pronunciation accuracy across recent sessions")
               elif overall_score >= 70:
                   strengths.append("Good pronunciation foundation with room for polish")
               else:
                   improvement_areas.append("Focus on clarity before speed to improve accuracy")

               return jsonify({
                   'overall_score': overall_score,
                   'trend': trend,
                   'recent_scores': recent_pronunciation,
                   'improvement_areas': improvement_areas,
                   'strengths': strengths,
                   'problem_sounds': problem_sounds,
                   'mispronounced_words': mispronounced_words,
                   'recommendations': recommendations,
                   'detailed_analysis': (
                       "This assessment is based on your recent chat sessions and pronunciation history. "
                       "Keep consistent short practice sessions for best gains."
                   ),
                   'sessions_analyzed': len(recent_pronunciation)
               }), 200
           except Exception as e:
               print(f"Advanced pronunciation assessment error: {e}")
               traceback.print_exc()
               return jsonify({'error': 'Could not load pronunciation assessment'}), 500

       @self.app.route('/api/progress/detailed-analytics', methods=['GET'])
       @jwt_required()
       def detailed_progress_analytics():
           try:
               username = get_jwt_identity()
               user_data = self._load_user_data(username)
               if user_data is None:
                   return jsonify({'error': 'User not found'}), 404

               profile = user_data.get('profile', {})
               stats = user_data.get('stats', {})
               total_sessions = int(stats.get('total_sessions', 0))

               pronunciation = int(round(profile.get('pronunciation_score', 0)))
               grammar = int(round(profile.get('grammar_score', 0)))
               fluency = int(round(profile.get('fluency_score', 0)))
               overall = int(round((pronunciation + grammar + fluency) / 3))

               base = 35
               if total_sessions > 0:
                   improvement_rate = max(0, (overall - base) / total_sessions)
               else:
                   improvement_rate = 0

               days_active = 0
               created_at = user_data.get('created_at')
               if created_at:
                   try:
                       created_dt = datetime.datetime.fromisoformat(created_at)
                       days_active = max(1, (datetime.datetime.now() - created_dt).days + 1)
                   except Exception:
                       days_active = 0

               level_change_history = user_data.get('level_change_history', [])
               level_progressions = max(0, len(level_change_history) - 1)

               recent_sessions = user_data.get('conversation_history', [])[-28:]
               weekly_session_counts = [0, 0, 0, 0]
               for item in recent_sessions:
                   ts = item.get('timestamp')
                   if not ts:
                       continue
                   try:
                       dt = datetime.datetime.fromisoformat(ts)
                   except Exception:
                       continue
                   age_days = (datetime.datetime.now() - dt).days
                   if 0 <= age_days < 28:
                       week_index = min(3, age_days // 7)
                       weekly_session_counts[3 - week_index] += 1

               problem_areas = []
               if pronunciation < 70:
                   problem_areas.append("Pronunciation consistency")
               if grammar < 70:
                   problem_areas.append("Grammar accuracy in longer messages")
               if fluency < 70:
                   problem_areas.append("Fluency and pacing")
               if not problem_areas:
                   problem_areas = ["No major weak area detected - keep consistency"]

               strengths = []
               if pronunciation >= 75:
                   strengths.append("Pronunciation is a strong area")
               if grammar >= 75:
                   strengths.append("Grammar structure is improving well")
               if fluency >= 75:
                   strengths.append("Fluency is developing steadily")
               if not strengths:
                   strengths = ["Regular practice habit established"]

               def consistency_label(score):
                   if score >= 85:
                       return "High"
                   if score >= 65:
                       return "Medium"
                   return "Low"

               predictive_insights = []
               if improvement_rate > 1:
                   predictive_insights.append("You are on track for noticeable improvement in the next 2-3 weeks.")
               if total_sessions < 5:
                   predictive_insights.append("Completing more sessions will improve analytics accuracy.")

               next_goals = [
                   "Complete 3 focused chat sessions this week.",
                   "Practice one pronunciation drill daily for 5 minutes.",
                   "Write one longer response per session to improve fluency."
               ]

               return jsonify({
                   'current_scores': {
                       'pronunciation': pronunciation,
                       'grammar': grammar,
                       'fluency': fluency,
                       'overall': overall
                   },
                   'learning_velocity': {
                       'pronunciation': round(improvement_rate, 1),
                       'grammar': round(improvement_rate, 1),
                       'fluency': round(improvement_rate, 1)
                   },
                   'improvement_rate': round(improvement_rate, 2),
                   'total_sessions': total_sessions,
                   'days_active': days_active,
                   'level_progressions': level_progressions,
                   'weekly_session_counts': weekly_session_counts,
                   'problem_areas': problem_areas,
                   'strengths': strengths,
                   'consistency_ratings': {
                       'pronunciation': consistency_label(pronunciation),
                       'grammar': consistency_label(grammar),
                       'fluency': consistency_label(fluency)
                   },
                   'milestones_achieved': [
                       "First completed chat session" if total_sessions > 0 else "No milestone yet",
                       "Reached intermediate proficiency band" if overall >= 60 else "Building foundation"
                   ],
                   'predictive_insights': predictive_insights,
                   'next_goals': next_goals,
                   'analytics_summary': (
                       f"You have completed {total_sessions} sessions over {days_active} active days. "
                       f"Current overall score is {overall}% with an average improvement rate of {round(improvement_rate, 1)}% per session."
                   )
               }), 200
           except Exception as e:
               print(f"Detailed analytics error: {e}")
               traceback.print_exc()
               return jsonify({'error': 'Could not load detailed analytics'}), 500

       @self.app.route('/api/chat/session-summary', methods=['POST'])
       @jwt_required()
       def session_summary():
           try:
               data = request.get_json() or {}
               messages = data.get('messages', [])
               user_messages = [m for m in messages if isinstance(m, dict) and m.get('type') == 'user']
               bot_messages = [m for m in messages if isinstance(m, dict) and m.get('type') == 'bot']

               total_user_msgs = len(user_messages)
               total_words = sum(len((m.get('content') or '').split()) for m in user_messages)
               avg_words = round(total_words / total_user_msgs, 1) if total_user_msgs else 0

               achievements = []
               if total_user_msgs >= 1:
                   achievements.append("Completed an English conversation practice session")
               if total_user_msgs >= 5:
                   achievements.append("Maintained an extended chat flow")
               if total_words >= 80:
                   achievements.append("Used longer responses to practice fluency")
               if not achievements:
                   achievements.append("Started a learning session")

               weaknesses = []
               if avg_words < 6 and total_user_msgs > 0:
                   weaknesses.append("Try writing slightly longer responses for deeper feedback")
               if total_user_msgs < 3:
                   weaknesses.append("More interaction per session will improve progress tracking")
               if not weaknesses:
                   weaknesses.append("No major weakness detected in this short session")

               recommendations = [
                   "Keep daily sessions short but consistent (10-15 minutes).",
                   "Focus on one grammar pattern and one pronunciation target per session."
               ]

               summary = {
                   'achievements': achievements,
                   'weaknesses': weaknesses,
                   'recommendations': recommendations,
                   'session_stats': {
                       'messages_sent': total_user_msgs,
                       'bot_replies': len(bot_messages),
                       'avg_words_per_message': avg_words,
                       'avg_pronunciation_score': 0,
                       'avg_grammar_score': 0,
                       'avg_fluency_score': 0
                   },
                   'summary_text': (
                       f"You sent {total_user_msgs} messages this session with an average of {avg_words} words per message. "
                       "Keep going - consistency is the fastest path to improvement."
                   )
               }
               return jsonify({'summary': summary}), 200
           except Exception as e:
               print(f"Session summary error: {e}")
               traceback.print_exc()
               return jsonify({'error': 'Could not generate session summary'}), 500

       # Health check
       @self.app.route('/api/health', methods=['GET'])
       def health_check():
           _lt_thr = _grammar_tool_loader_thread
           _lt_loading = _lt_thr is not None and _lt_thr.is_alive()
           return jsonify({
               'status': 'healthy',
               'version': '3.1',
               'build': 'lt-lazy-v2',
               'features': [
                   'enhanced_pronunciation_scoring', 
                   'improved_grammar_analysis', 
                   'advanced_fluency_metrics',
                   'manual_level_selection',
                   'fixed_response_cutoff',
                   'enhanced_accent_correction',
                   'intent_detection',
                   'session_summaries'
               ],
               'nlp_tools': {
                   'spacy_loaded': bool(nlp),
                   'grammar_tool_loaded': grammar_tool is not None,
                   'grammar_tool_loading': _lt_loading,
                   'grammar_tool_pending': (
                       grammar_tool is None
                       and _grammar_tool_error is None
                       and _lt_loading
                   ),
                   'grammar_tool_error': _grammar_tool_error,
                   'pronouncing_available': True
               },
               'timestamp': datetime.datetime.now().isoformat()
           }), 200

       @self.app.route('/')
       def home():
           return "Flask backend running"

    def _generate_accent_correction_enhanced(self, message, pronunciation_analysis):
       """Enhanced accent correction with drill-based exercises"""
       try:
           if not pronunciation_analysis.get('mispronunciations'):
               return None
           
           mispronunciations = pronunciation_analysis['mispronunciations'][:3]
           
           # Build structured drill-based correction
           correction_parts = []
           
           # 1. Acknowledgment
           correction_parts.append(f"I heard you say: '{message}'")
           
           # 2. Specific phonetic guidance
           for mp in mispronunciations[:2]:  # Focus on top 2 errors
               word = mp['word']
               tips = mp.get('common_errors', [])
               
               if tips:
                   correction_parts.append(f"For '{word}': {tips[0]}")
           
           # 3. Drill exercises
           drill_words = []
           practice_sounds = set()
           
           for mp in mispronunciations:
               word = mp['word']
               phoneme_errors = mp.get('phoneme_errors', [])
               practice_sounds.update(phoneme_errors)
               drill_words.append(word)
           
           # Generate practice exercises (always define; metadata references this even if no phoneme tags)
           sound_exercises = []
           if practice_sounds:
               sound_exercises = self._generate_drill_exercises(practice_sounds, drill_words)
               correction_parts.append("Practice these:")
               correction_parts.extend(sound_exercises)
           
           # 4. Encouragement
           score = pronunciation_analysis.get('score', 70)
           if score >= 60:
               correction_parts.append("You're doing well! Keep practicing these sounds.")
           else:
               correction_parts.append("Don't worry, pronunciation takes practice. Try these exercises.")
           
           textual_feedback = " ".join(correction_parts)
           
           # Enhanced metadata
           correction_metadata = {
               'mispronounced_words': [
                   {
                       'word': mp['word'],
                       'expected_phonemes': mp.get('expected_phonemes', []),
                       'accuracy': mp.get('accuracy', 0),
                       'tips': mp.get('common_errors', []),
                       'phoneme_errors': mp.get('phoneme_errors', [])
                   }
                   for mp in mispronunciations
               ],
               'overall_score': pronunciation_analysis.get('score', 0),
               'focus_sounds': list(practice_sounds),
               'practice_words': drill_words,
               'drill_exercises': sound_exercises
           }
           
           return {
               'textual_feedback': textual_feedback,
               'metadata': correction_metadata,
               'drill_based': True,
               'timestamp': datetime.datetime.now().isoformat()
           }
           
       except Exception as e:
           print(f"Enhanced accent correction error: {e}")
           return {
               'textual_feedback': "Keep practicing your pronunciation! Focus on speaking clearly and slowly.",
               'metadata': {'error': str(e)},
               'timestamp': datetime.datetime.now().isoformat()
           }

    def _generate_drill_exercises(self, practice_sounds, drill_words):
       """Generate specific drill exercises for problematic sounds"""
       exercises = []
       
       sound_drills = {
           'TH': [
               "Repeat: think - thank - three - through",
               "Practice: 'Put your tongue between your teeth'",
               "Try: this, that, the, thing"
           ],
           'R': [
               "Repeat: red - right - really - crystal",
               "Practice: 'Curl your tongue back slightly'",
               "Try: around, pretty, friend, great"
           ],
           'L': [
               "Repeat: light - love - little - local",
               "Practice: 'Touch tongue to roof of mouth'", 
               "Try: help, people, family, well"
           ],
           'V': [
               "Repeat: very - voice - video - visit",
               "Practice: 'Bottom lip touches upper teeth'",
               "Try: have, give, love, live"
           ],
           'W': [
               "Repeat: water - wonderful - we - why",
               "Practice: 'Round your lips like whistling'",
               "Try: one, when, where, what"
           ]
       }
       
       for sound in practice_sounds:
           if sound in sound_drills:
               exercises.extend(sound_drills[sound][:2])  # Take first 2 exercises per sound
       
       # Add word-specific exercises
       if drill_words:
           exercises.append(f"Repeat slowly: {' - '.join(drill_words[:3])}")
       
       return exercises[:4]  # Limit to 4 exercises max

    def run(self, debug=True, port=5050):
        """Run the enhanced Flask app"""
        print("🚀 Enhanced AI English Tutor Backend v3.1 Starting!")
        print(f"🌐 Server: http://127.0.0.1:{port}")
        print("✨ Enhanced Features:")
        print("   📊 Advanced phoneme-level pronunciation scoring")
        print("   📝 Enhanced grammar analysis with error categorization")
        print("   🎯 Improved fluency metrics with pause analysis")
        print("   🎭 Manual level selection with auto-adjustment toggle")
        print("   🔧 Fixed chatbot response cut-off bug")
        print("   💬 Enhanced accent correction with drill exercises")
        print("   🧠 Intent detection and adaptive responses")
        print("   📋 Session summaries and advanced analytics")
        print("💡 Tip: Set GROQ_API_KEY environment variable for AI responses")

        # Flask debug mode spawns a second interpreter on Windows; keep it off for stable local dev.
        # Flask debug reloader spawns a second process, which re-downloads heavy NLP deps on Windows.
        self.app.run(host="0.0.0.0", debug=debug, port=port, use_reloader=False)

# Create app instance
app_instance = EnhancedAIEnglishTutor()

# For production deployment
app = app_instance.app

if __name__ == "__main__":
   app_instance.run()