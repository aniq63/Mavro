from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_health_endpoint():
    response = client.get('/api/health')
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'


def test_tutor_chat_with_conversation_memory():
    conversation_id = 'demo-loop-1'
    first_response = client.post(
        '/api/tutor/chat',
        json={'conversation_id': conversation_id, 'message': 'Explain a Python for loop.'},
    )
    assert first_response.status_code == 200, first_response.text
    first_data = first_response.json()
    assert first_data['lesson_title']
    assert first_data['message']
    assert len(first_data['steps']) >= 1

    follow_up = client.post(
        '/api/tutor/chat',
        json={'conversation_id': conversation_id, 'message': 'Why does it stop at 2?'},
    )
    assert follow_up.status_code == 200, follow_up.text
    follow_up_data = follow_up.json()
    assert '2' in follow_up_data['message'] or 'range' in follow_up_data['message'].lower()


def test_empty_message_is_rejected():
    response = client.post('/api/tutor/chat', json={'conversation_id': 'demo-empty', 'message': '   '})
    assert response.status_code == 422


def test_rich_visualization_actions_are_validated():
    from schemas.tutor import TutorResponse

    lesson = {
        'lesson_title': 'Solve and visualise',
        'message': 'We solve the equation and check it with a graph.',
        'spoken_explanation': 'The solution is x equals six.',
        'steps': [
            {
                'id': 'step-1',
                'title': 'Graph the line',
                'layout': 'equation',
                'narration': 'The graph shows every pair that satisfies the equation.',
                'whiteboard_actions': [
                    {'type': 'show_graph', 'id': 'graph-1', 'label': 'y = 2x + 5', 'points': [[0, 5], [3, 11]], 'x_label': 'x', 'y_label': 'y'},
                    {'type': 'show_table', 'id': 'table-1', 'columns': ['x', 'y'], 'rows': [['0', '5'], ['3', '11']]},
                ],
            }
        ],
        'follow_up_question': None,
        'board_summary': 'A graph and a value table.',
    }

    validated = TutorResponse.model_validate(lesson)
    action_types = {action.type for action in validated.steps[0].whiteboard_actions}
    assert action_types == {'show_graph', 'show_table'}
    graph = validated.steps[0].whiteboard_actions[0]
    assert graph.points == [[0, 5], [3, 11]]
    assert graph.x_label == 'x'


def test_flat_groq_action_payload_is_normalized():
    malformed = {
        'lesson_title': 'MLOps basics',
        'message': 'MLOps is a workflow for production ML.',
        'spoken_explanation': 'It combines ML and DevOps.',
        'steps': [
            {
                'id': 'step-1',
                'title': 'What it is',
                'narration': 'MLOps blends ML with DevOps.',
                'whiteboard_actions': [
                    {'content': 'MLOps = ML + DevOps', 'shape': 'rectangle'},
                    {'shape': 'rectangle'},
                    {'from': 'ML Workflow', 'to': 'DevOps Practices'},
                ],
            }
        ],
        'follow_up_question': 'Want an example?',
        'board_summary': 'The lesson is about MLOps.',
    }

    normalized = client.post('/api/tutor/chat', json={'conversation_id': 'demo-malformed', 'message': 'Explain MLOps.'})
    assert normalized.status_code == 200

    from schemas.tutor import TutorResponse
    validated = TutorResponse.model_validate(malformed)
    assert validated.lesson_title == 'MLOps basics'
    assert validated.steps[0].whiteboard_actions[0].type in {'show_text', 'add_shape'}
