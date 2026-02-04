import sys
from unittest.mock import MagicMock

# Mock spleeter and basic-pitch before importing main
sys.modules["spleeter"] = MagicMock()
sys.modules["spleeter.separator"] = MagicMock()
sys.modules["basic_pitch"] = MagicMock()
sys.modules["basic_pitch.inference"] = MagicMock()
sys.modules["basic_pitch.constants"] = MagicMock()
sys.modules["basic_pitch.note_creation"] = MagicMock()

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
