from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator

from services.tts_service import (
    MAX_TEXT_CHARS,
    TTSAuthError,
    TTSError,
    TTSUnavailableError,
    synthesize_speech,
    tts_status,
)

router = APIRouter(prefix='/api/voice', tags=['voice'])


class SpeechRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: str | None = None

    @field_validator('text')
    @classmethod
    def trim_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError('Text cannot be empty.')
        return cleaned


@router.get('/status')
def voice_status() -> dict[str, object]:
    """Report whether a server-side TTS provider is configured. No secrets are returned."""
    return tts_status()


@router.post('/synthesize')
async def synthesize(request: SpeechRequest) -> Response:
    if len(request.text) > MAX_TEXT_CHARS * 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f'Narration is too long (max {MAX_TEXT_CHARS} characters per segment).',
        )
    try:
        audio = await synthesize_speech(request.text, request.voice)
    except TTSAuthError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except TTSUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except TTSError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return Response(
        content=audio.content,
        media_type=audio.media_type,
        headers={
            'Cache-Control': 'private, max-age=86400',
            'X-TTS-Provider': audio.provider,
            'X-TTS-Voice': audio.voice,
        },
    )
