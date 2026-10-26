from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.tutor import router as tutor_router
from routes.voice import router as voice_router

load_dotenv()

app = FastAPI(
    title='Mavro Tutor API',
    version='0.1.0',
    description='AI-powered tutoring API for Mavro with structured lesson responses and whiteboard guidance.',
)

frontend_origins = [
    origin.strip()
    for origin in os.getenv('FRONTEND_ORIGIN', 'http://localhost:5173').split(',')
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['X-TTS-Provider', 'X-TTS-Voice'],
)

app.include_router(tutor_router)
app.include_router(voice_router)


@app.get('/api/health')
def health() -> dict[str, Any]:
    return {'status': 'ok', 'service': 'mavro-tutor-api'}


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('main:app', host='0.0.0.0', port=8000, reload=True)
