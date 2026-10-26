from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, status

from schemas.tutor import TutorChatRequest, TutorResponse
from services.groq_service import TutorProviderError, generate_tutor_response

router = APIRouter(prefix='/api/tutor', tags=['tutor'])

_CONVERSATIONS: dict[str, dict[str, Any]] = {}
_CONVERSATION_LOCKS: dict[str, asyncio.Lock] = {}


def _lock_for(conversation_id: str) -> asyncio.Lock:
    if conversation_id not in _CONVERSATION_LOCKS:
        _CONVERSATION_LOCKS[conversation_id] = asyncio.Lock()
    return _CONVERSATION_LOCKS[conversation_id]


def _ensure_conversation(conversation_id: str) -> dict[str, Any]:
    if conversation_id not in _CONVERSATIONS:
        _CONVERSATIONS[conversation_id] = {
            'messages': [],
            'board_summary': 'The whiteboard is empty.',
            'lesson_title': None,
            'last_lesson': None,
        }
    return _CONVERSATIONS[conversation_id]


@router.post('/chat', response_model=TutorResponse)
async def chat_with_tutor(request: TutorChatRequest) -> TutorResponse:
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Message cannot be empty.')

    conversation = _ensure_conversation(request.conversation_id)
    lock = _lock_for(request.conversation_id)

    async with lock:
        history = list(conversation.get('messages', []))

        previous_lesson = conversation.get('last_lesson')
        previous_summary = (
            (previous_lesson or {}).get('board_summary')
            or conversation.get('board_summary')
            or 'The whiteboard is empty.'
        )

        # Prefer the board summary sent by the client; otherwise use the stored lesson state.
        effective_board_summary = (
            request.board_summary
            if request.board_summary and request.board_summary.strip()
            else previous_summary
        )

        # Attach the effective board summary to the request so groq_service can use it.
        enriched_request = TutorChatRequest(
            conversation_id=request.conversation_id,
            message=request.message,
            board_summary=effective_board_summary,
        )

        try:
            response = generate_tutor_response(enriched_request, history, previous_lesson)
        except TutorProviderError as exc:
            # Do NOT append anything to history on failure so context stays intact.
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc

        # Only update history after a successful response.
        conversation['messages'].append({'role': 'user', 'content': request.message})
        conversation['messages'].append(
            {
                'role': 'assistant',
                'content': f'{response.lesson_title}: {response.message}',
            }
        )
        if response.board_summary:
            conversation['board_summary'] = response.board_summary
        conversation['lesson_title'] = response.lesson_title
        conversation['last_lesson'] = response.model_dump(by_alias=True, mode='json')
        return response


@router.delete('/chat/{conversation_id}')
async def reset_conversation(conversation_id: str) -> dict[str, str]:
    """Discard stored history for the given conversation so the next message starts fresh."""
    _CONVERSATIONS.pop(conversation_id, None)
    _CONVERSATION_LOCKS.pop(conversation_id, None)
    return {'status': 'reset', 'conversation_id': conversation_id}
