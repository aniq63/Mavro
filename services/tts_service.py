from __future__ import annotations

"""Replaceable text-to-speech providers for Mavro.

Credentials live only in the backend environment. The frontend calls
``POST /api/voice/synthesize`` and never sees a provider key.

Supported providers:
- elevenlabs (preferred when credits are available)
- groq (Canopy Labs Orpheus, uses GROQ_API_KEY; free-tier terms must be accepted)
- openai
- none / auto (auto tries each configured provider in order)
"""

import asyncio
import io
import os
import re
import time
import wave
from abc import ABC, abstractmethod
from collections import OrderedDict
from dataclasses import dataclass

import httpx
from dotenv import load_dotenv

load_dotenv()

MAX_TEXT_CHARS = int(os.getenv('TTS_MAX_CHARS', '1400'))
GROQ_TTS_MAX_CHARS = max(1, min(int(os.getenv('GROQ_TTS_MAX_CHARS', '190')), 200))
TTS_RETRY_SECONDS = float(os.getenv('TTS_RETRY_SECONDS', '120'))


class TTSError(RuntimeError):
    pass


class TTSUnavailableError(TTSError):
    pass


class TTSAuthError(TTSError):
    pass


@dataclass(slots=True)
class SpeechAudio:
    content: bytes
    media_type: str
    provider: str
    voice: str


class TTSProvider(ABC):
    name = 'base'

    @abstractmethod
    async def synthesize(self, text: str, voice: str | None = None) -> SpeechAudio:
        raise NotImplementedError


def clean_narration(text: str) -> str:
    """Turn lesson narration into warm, speakable prose without markdown noise."""
    cleaned = str(text or '')
    cleaned = re.sub(r'```[\s\S]*?```', ' ', cleaned)
    cleaned = re.sub(r'`([^`]+)`', r'\1', cleaned)
    cleaned = re.sub(r'[*_#>|]+', ' ', cleaned)
    cleaned = cleaned.replace('->', ' to ').replace('=>', ' becomes ')
    cleaned = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', cleaned)
    cleaned = re.sub(r'\s*\n+\s*', '. ', cleaned)
    cleaned = re.sub(r'\.{2,}', '.', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    cleaned = re.sub(r'([.!?])([A-Za-z])', r'\1 \2', cleaned)
    if cleaned and cleaned[-1] not in '.!?':
        cleaned += '.'
    return cleaned


class ElevenLabsTTS(TTSProvider):
    name = 'elevenlabs'

    def __init__(self) -> None:
        self.api_key = os.getenv('ELEVENLABS_API_KEY', '').strip()
        self.default_voice = os.getenv('ELEVENLABS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM').strip()
        self.model = os.getenv('ELEVENLABS_MODEL', 'eleven_multilingual_v2').strip()
        self.stability = float(os.getenv('ELEVENLABS_STABILITY', '0.45'))
        self.similarity = float(os.getenv('ELEVENLABS_SIMILARITY', '0.78'))
        self.style = float(os.getenv('ELEVENLABS_STYLE', '0.35'))
        self.output_format = os.getenv('ELEVENLABS_OUTPUT_FORMAT', 'mp3_44100_128').strip()
        if not self.api_key:
            raise TTSUnavailableError('ElevenLabs API key is not configured.')

    async def synthesize(self, text: str, voice: str | None = None) -> SpeechAudio:
        voice_id = (voice or self.default_voice).strip()
        url = f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}'
        payload = {
            'text': text,
            'model_id': self.model,
            'voice_settings': {
                'stability': self.stability,
                'similarity_boost': self.similarity,
                'style': self.style,
                'use_speaker_boost': True,
            },
        }
        params = {'output_format': self.output_format}
        headers = {
            'xi-api-key': self.api_key,
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload, params=params, headers=headers)
        except httpx.HTTPError as exc:
            raise TTSUnavailableError('Could not reach ElevenLabs.') from exc

        if response.status_code in {401, 403}:
            raise TTSAuthError('ElevenLabs rejected the configured API key.')
        if response.status_code >= 400:
            raise TTSUnavailableError(f'ElevenLabs returned HTTP {response.status_code}.')
        if not response.content:
            raise TTSUnavailableError('ElevenLabs returned empty audio.')
        return SpeechAudio(response.content, 'audio/mpeg', self.name, voice_id)


class OpenAITTS(TTSProvider):
    name = 'openai'

    def __init__(self) -> None:
        self.api_key = (
            os.getenv('OPENAI_TTS_API_KEY', '').strip()
            or os.getenv('OPENAI_API_KEY', '').strip()
        )
        self.default_voice = os.getenv('OPENAI_TTS_VOICE', 'nova').strip()
        self.model = os.getenv('OPENAI_TTS_MODEL', 'gpt-4o-mini-tts').strip()
        self.speed = float(os.getenv('OPENAI_TTS_SPEED', '0.96'))
        if not self.api_key:
            raise TTSUnavailableError('OpenAI TTS API key is not configured.')

    async def synthesize(self, text: str, voice: str | None = None) -> SpeechAudio:
        voice_name = (voice or self.default_voice).strip()
        payload = {
            'model': self.model,
            'input': text,
            'voice': voice_name,
            'response_format': 'mp3',
            'speed': self.speed,
        }
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    'https://api.openai.com/v1/audio/speech',
                    json=payload,
                    headers=headers,
                )
        except httpx.HTTPError as exc:
            raise TTSUnavailableError('Could not reach OpenAI TTS.') from exc

        if response.status_code in {401, 403}:
            raise TTSAuthError('OpenAI rejected the configured API key.')
        if response.status_code >= 400:
            raise TTSUnavailableError(f'OpenAI TTS returned HTTP {response.status_code}.')
        if not response.content:
            raise TTSUnavailableError('OpenAI TTS returned empty audio.')
        return SpeechAudio(response.content, 'audio/mpeg', self.name, voice_name)


def split_narration(text: str, limit: int) -> list[str]:
    """Split long narration into provider-sized chunks at natural pauses."""
    cleaned = str(text or '').strip()
    if not cleaned:
        return []
    if len(cleaned) <= limit:
        return [cleaned]

    chunks: list[str] = []
    remaining = cleaned
    while remaining:
        if len(remaining) <= limit:
            chunks.append(remaining)
            break
        window = remaining[: limit + 1]
        split_at = max(
            window.rfind('. '),
            window.rfind('? '),
            window.rfind('! '),
            window.rfind('; '),
            window.rfind(', '),
            window.rfind(' '),
        )
        if split_at < limit // 2:
            split_at = window.rfind(' ')
        if split_at <= 0:
            chunk = remaining[:limit].strip()
            remaining = remaining[limit:].strip()
        else:
            chunk = remaining[: split_at + 1].strip()
            remaining = remaining[split_at + 1 :].strip()
        if chunk:
            chunks.append(chunk)
    return chunks


class GroqTTS(TTSProvider):
    """Canopy Labs Orpheus TTS hosted by Groq.

    Orpheus accepts at most 200 characters per request, so longer narration is
    rendered in chunks and joined into one WAV payload.
    """

    name = 'groq'

    def __init__(self) -> None:
        self.api_key = os.getenv('GROQ_TTS_API_KEY', '').strip() or os.getenv('GROQ_API_KEY', '').strip()
        self.default_voice = os.getenv('GROQ_TTS_VOICE', 'hannah').strip() or 'hannah'
        self.model = os.getenv('GROQ_TTS_MODEL', 'canopylabs/orpheus-v1-english').strip()
        if not self.api_key:
            raise TTSUnavailableError('Groq API key is not configured for text-to-speech.')

    async def _render_chunk(self, client: httpx.AsyncClient, text: str, voice_name: str) -> bytes:
        payload = {
            'model': self.model,
            'voice': voice_name,
            'input': text,
            'response_format': 'wav',
        }
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
        }
        try:
            response = await client.post(
                'https://api.groq.com/openai/v1/audio/speech',
                json=payload,
                headers=headers,
            )
        except httpx.HTTPError as exc:
            raise TTSUnavailableError('Could not reach Groq TTS.') from exc

        if response.status_code in {401, 403}:
            raise TTSAuthError('Groq rejected the configured API key for text-to-speech.')
        if response.status_code >= 400:
            detail = response.text[:240].lower()
            if 'terms' in detail or 'model_terms_required' in detail:
                raise TTSUnavailableError(
                    'Groq Orpheus TTS terms have not been accepted for this organisation. '
                    'Open the Groq console model playground and accept the Orpheus terms.'
                )
            raise TTSUnavailableError(f'Groq TTS returned HTTP {response.status_code}.')
        if not response.content:
            raise TTSUnavailableError('Groq TTS returned empty audio.')
        return response.content

    async def synthesize(self, text: str, voice: str | None = None) -> SpeechAudio:
        voice_name = (voice or self.default_voice).strip()
        chunks = split_narration(text, GROQ_TTS_MAX_CHARS)
        if not chunks:
            raise TTSUnavailableError('Groq TTS received empty narration.')

        output = io.BytesIO()
        writer: wave.Wave_write | None = None
        params: wave._wave_params | None = None
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                for chunk in chunks:
                    content = await self._render_chunk(client, chunk, voice_name)
                    with wave.open(io.BytesIO(content), 'rb') as reader:
                        if writer is None:
                            params = reader.getparams()
                            writer = wave.open(output, 'wb')
                            writer.setparams(params)
                        elif reader.getparams()[:3] != params[:3]:
                            raise TTSUnavailableError('Groq TTS returned inconsistent audio formats.')
                        writer.writeframes(reader.readframes(reader.getnframes()))
        except wave.Error as exc:
            raise TTSUnavailableError('Groq TTS returned audio that could not be read.') from exc
        finally:
            if writer is not None:
                writer.close()

        audio = output.getvalue()
        if not audio:
            raise TTSUnavailableError('Groq TTS produced empty audio.')
        return SpeechAudio(audio, 'audio/wav', self.name, voice_name)


# Small in-process cache so replaying a step is instant and we do not re-bill the provider.
_CACHE: OrderedDict[tuple[str, str, str], SpeechAudio] = OrderedDict()
_CACHE_LOCK = asyncio.Lock()
_CACHE_LIMIT = int(os.getenv('TTS_CACHE_SIZE', '48'))


_PROVIDER_FAILED_UNTIL: dict[str, float] = {}


def _configured_provider_names() -> list[str]:
    configured = os.getenv('TTS_PROVIDER', 'auto').strip().lower()
    if configured in {'none', 'disabled'}:
        return []
    if configured and configured != 'auto':
        return [configured]

    names: list[str] = []
    if os.getenv('ELEVENLABS_API_KEY', '').strip():
        names.append('elevenlabs')
    if os.getenv('GROQ_TTS_API_KEY', '').strip() or os.getenv('GROQ_API_KEY', '').strip():
        names.append('groq')
    if os.getenv('OPENAI_TTS_API_KEY', '').strip() or os.getenv('OPENAI_API_KEY', '').strip():
        names.append('openai')
    return names


def _make_provider(name: str) -> TTSProvider | None:
    try:
        if name == 'elevenlabs':
            return ElevenLabsTTS()
        if name == 'groq':
            return GroqTTS()
        if name == 'openai':
            return OpenAITTS()
    except TTSUnavailableError:
        return None
    return None


def _provider_candidates() -> list[TTSProvider]:
    providers: list[TTSProvider] = []
    for name in _configured_provider_names():
        provider = _make_provider(name)
        if provider is not None:
            providers.append(provider)
    return providers


def _provider_in_cooldown(name: str) -> bool:
    return _PROVIDER_FAILED_UNTIL.get(name, 0.0) > time.monotonic()


def _mark_provider_failed(name: str) -> None:
    _PROVIDER_FAILED_UNTIL[name] = time.monotonic() + TTS_RETRY_SECONDS


def get_tts_provider() -> TTSProvider | None:
    providers = _provider_candidates()
    return providers[0] if providers else None


def tts_status() -> dict[str, object]:
    providers = _provider_candidates()
    if not providers:
        return {'available': False, 'provider': 'none', 'voice': None, 'fallbacks': []}

    ready = [provider for provider in providers if not _provider_in_cooldown(provider.name)]
    if not ready:
        retry_after = max(
            (_PROVIDER_FAILED_UNTIL.get(provider.name, 0.0) - time.monotonic() for provider in providers),
            default=0.0,
        )
        return {
            'available': False,
            'provider': 'cooling_down',
            'voice': None,
            'fallbacks': [provider.name for provider in providers],
            'retry_seconds': max(0, round(retry_after)),
        }

    primary = ready[0]
    return {
        'available': True,
        'provider': primary.name,
        'voice': getattr(primary, 'default_voice', None),
        'fallbacks': [provider.name for provider in ready[1:]],
    }


async def synthesize_speech(text: str, voice: str | None = None) -> SpeechAudio:
    clean_text = clean_narration(text)
    if not clean_text:
        raise TTSError('Narration text is empty.')
    if len(clean_text) > MAX_TEXT_CHARS:
        clean_text = clean_text[:MAX_TEXT_CHARS].rsplit(' ', 1)[0] + '.'

    providers = _provider_candidates()
    if not providers:
        raise TTSUnavailableError('No text-to-speech provider is configured.')

    last_error: TTSError | None = None
    skipped_for_cooldown = False

    for provider in providers:
        cache_key = (provider.name, voice or '', clean_text)
        async with _CACHE_LOCK:
            cached = _CACHE.get(cache_key)
            if cached is not None:
                _CACHE.move_to_end(cache_key)
                return cached

        if _provider_in_cooldown(provider.name):
            skipped_for_cooldown = True
            continue

        try:
            audio = await provider.synthesize(clean_text, voice)
        except TTSError as exc:
            last_error = exc
            _mark_provider_failed(provider.name)
            continue

        async with _CACHE_LOCK:
            _CACHE[cache_key] = audio
            _CACHE.move_to_end(cache_key)
            while len(_CACHE) > _CACHE_LIMIT:
                _CACHE.popitem(last=False)
        return audio

    if last_error is not None:
        raise last_error
    if skipped_for_cooldown:
        raise TTSUnavailableError('All text-to-speech providers are cooling down after recent failures.')
    raise TTSUnavailableError('No text-to-speech provider is currently available.')
