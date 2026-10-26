from __future__ import annotations

"""Offline / fallback whiteboard responses used only when the Groq API is unavailable."""

from typing import Iterable

from schemas.tutor import TeachingStep, TutorResponse, WhiteboardAction


class WhiteboardLessonError(ValueError):
    pass


def safe_tutor_response(
    question: str,
    history: Iterable[dict] | None = None,
    board_summary: str | None = None,
) -> TutorResponse:
    """Return a generic error response that honestly tells the student the AI is unavailable.

    This replaces the previous behaviour of always returning a hardcoded Python loop
    lesson regardless of what the student actually asked.
    """
    if not question or not question.strip():
        raise WhiteboardLessonError('A student question is required.')

    topic = question.strip()
    short_topic = topic[:60] + ('...' if len(topic) > 60 else '')

    return TutorResponse(
        lesson_title='Tutor temporarily unavailable',
        message=(
            'I could not reach the AI service right now, so I cannot answer your question about: '
            + short_topic
            + '. Please check that the backend is running and the Groq API key is valid, then try again.'
        ),
        spoken_explanation=(
            'The AI tutor is temporarily unavailable. Please try again in a moment.'
        ),
        steps=[
            TeachingStep(
                id='step-1',
                title='Service unavailable',
                narration='The Groq AI service could not be reached. Your question has not been lost.',
                whiteboard_actions=[
                    WhiteboardAction(
                        type='show_text',
                        text='AI service unavailable -- please retry.',
                    ),
                ],
            )
        ],
        follow_up_question=None,
        board_summary=board_summary or 'The whiteboard is empty.',
    )
