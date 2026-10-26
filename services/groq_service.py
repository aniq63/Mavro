from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from typing import Any

from dotenv import load_dotenv
from groq import Groq
from pydantic import ValidationError

from schemas.tutor import TutorChatRequest, TutorResponse
from services.tutor_prompt import MAVRO_SYSTEM_PROMPT
from services.whiteboard_service import safe_tutor_response

load_dotenv()

logger = logging.getLogger(__name__)

FOLLOW_UP_CUES = (
    'why',
    'how',
    'what about',
    'what does',
    'explain more',
    'more detail',
    'clarify',
    'confused',
    "don't understand",
    'do not understand',
    'again',
    'that step',
    'this step',
    'the step',
    'previous',
    'last one',
    'and then',
    'what happens',
    'can you show',
    'example',
)

NEW_TOPIC_CUES = (
    'new topic',
    'different topic',
    'instead',
    'forget',
    'switch to',
    'teach me about',
    'explain photosynthesis',
    'explain recursion',
    'explain stacks',
    'explain queues',
)


class TutorProviderError(RuntimeError):
    pass


def _get_api_key() -> str:
    api_key = os.getenv('GROQ_API_KEY', '').strip()
    if not api_key:
        raise TutorProviderError('Groq API key is not configured.')
    return api_key


def _get_model_name() -> str:
    model = os.getenv('GROQ_MODEL', 'openai/gpt-oss-20b').strip()
    if not model:
        raise TutorProviderError('Groq model is not configured.')
    return model


def _compact_lesson(lesson: dict[str, Any] | None) -> str | None:
    """Serialize only the lesson context the model needs, keeping the prompt small."""
    if not lesson:
        return None
    steps = []
    for step in lesson.get('steps', [])[:7]:
        actions = []
        for action in step.get('whiteboard_actions', [])[:10]:
            actions.append({key: value for key, value in action.items() if value is not None})
        steps.append(
            {
                'id': step.get('step_id') or step.get('id'),
                'title': step.get('title'),
                'layout': step.get('layout'),
                'actions': actions,
            }
        )
    return json.dumps(
        {
            'lesson_id': lesson.get('lesson_id'),
            'lesson_title': lesson.get('lesson_title'),
            'steps': steps,
            'board_summary': lesson.get('board_summary'),
        },
        ensure_ascii=False,
    )


def _build_messages(
    question: str,
    history: list[dict[str, str]],
    board_summary: str | None,
    previous_lesson: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [{'role': 'system', 'content': MAVRO_SYSTEM_PROMPT}]
    for entry in history[-10:]:
        if 'role' in entry and 'content' in entry:
            role = str(entry['role'])
            if role in {'user', 'assistant'}:
                messages.append({'role': role, 'content': str(entry['content'])})
    if previous_lesson:
        compact = _compact_lesson(previous_lesson)
        if compact:
            messages.append(
                {
                    'role': 'system',
                    'content': (
                        'Previous lesson context. If this new student message is a follow-up or clarification, '
                        'continue this lesson, reuse lesson_id and existing ids, and return the complete revised '
                        'lesson. If it is a new topic, ignore this lesson entirely.\n'
                        + compact
                    ),
                }
            )
    if board_summary:
        messages.append({'role': 'system', 'content': f'Current whiteboard summary: {board_summary}'})
    messages.append({'role': 'user', 'content': question})
    return messages


def _looks_like_follow_up(question: str, previous_lesson: dict[str, Any] | None) -> bool:
    if not previous_lesson:
        return False
    text = question.lower().strip()
    if any(cue in text for cue in NEW_TOPIC_CUES):
        return False
    if any(cue in text for cue in FOLLOW_UP_CUES):
        return True
    title = str(previous_lesson.get('lesson_title') or '').lower()
    title_words = [word for word in re.findall(r'[a-z0-9]+', title) if len(word) > 3]
    return any(word in text for word in title_words)


def _normalize_lesson_identity(
    response: TutorResponse,
    question: str,
    previous_lesson: dict[str, Any] | None,
) -> TutorResponse:
    previous_id = None
    if previous_lesson:
        previous_id = previous_lesson.get('lesson_id')
    mode = response.mode or 'new_lesson'
    if mode not in {'new_lesson', 'follow_up', 'clarification'}:
        mode = 'new_lesson'

    if previous_id and (mode in {'follow_up', 'clarification'} or _looks_like_follow_up(question, previous_lesson)):
        response.mode = 'follow_up' if mode != 'clarification' else 'clarification'
        response.lesson_id = str(previous_id)
    else:
        response.mode = 'new_lesson'
        response.lesson_id = response.lesson_id or f'lesson-{uuid.uuid4().hex[:10]}'

    return response


def _coerce_structured_response(raw: Any) -> TutorResponse:
    if isinstance(raw, TutorResponse):
        return raw
    if isinstance(raw, dict):
        try:
            return TutorResponse.model_validate(raw)
        except ValidationError as exc:
            raise TutorProviderError(f'Malformed tutor response: {exc}') from exc
    raise TutorProviderError('The model returned an unsupported response format.')


def _request_completion(client: Groq, model: str, messages: list[dict[str, str]]):
    """Call Groq, retrying once when a free-tier rate limit is hit."""
    for attempt in range(2):
        try:
            return client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.45,
                max_tokens=3000,
                response_format={'type': 'json_object'},
            )
        except Exception as exc:  # pragma: no cover - provider-specific path
            status_code = getattr(exc, 'status_code', None)
            if status_code != 429 or attempt == 1:
                raise
            retry_after = 3.0
            response = getattr(exc, 'response', None)
            if response is not None:
                try:
                    retry_after = float(response.headers.get('retry-after', retry_after))
                except (TypeError, ValueError):
                    pass
            time.sleep(min(max(retry_after, 2.0), 10.0))
    raise TutorProviderError('Groq request failed after retry.')


def generate_tutor_response(
    request: TutorChatRequest,
    history: list[dict[str, str]],
    previous_lesson: dict[str, Any] | None = None,
) -> TutorResponse:
    try:
        api_key = _get_api_key()
        model = _get_model_name()
    except TutorProviderError:
        return safe_tutor_response(request.message, history, request.board_summary)

    client = Groq(api_key=api_key)
    messages = _build_messages(request.message, history, request.board_summary, previous_lesson)
    try:
        response = _request_completion(client, model, messages)
    except Exception as exc:  # pragma: no cover - provider-specific path
        logger.warning('Groq tutor request failed: %s', exc)
        return safe_tutor_response(request.message, history, request.board_summary)

    content = getattr(response, 'choices', [None])[0].message.content if getattr(response, 'choices', None) else None
    if not content:
        logger.warning('Groq tutor request returned no content.')
        return safe_tutor_response(request.message, history, request.board_summary)

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        logger.warning('Groq tutor response was not valid JSON: %s', content[:300])
        return safe_tutor_response(request.message, history, request.board_summary)

    try:
        structured = _coerce_structured_response(parsed)
        return _normalize_lesson_identity(structured, request.message, previous_lesson)
    except TutorProviderError as exc:
        logger.warning('Groq tutor response failed validation: %s', exc)
        return safe_tutor_response(request.message, history, request.board_summary)
