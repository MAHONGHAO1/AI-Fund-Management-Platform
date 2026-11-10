from fastapi.testclient import TestClient

import fund_service
from fund_web import create_app


def test_local_api_health_and_origin_guard():
    client = TestClient(create_app())
    assert client.get('/api/health').json()['scope'] == 'loopback'
    assert client.get('/api/health', headers={'Origin': 'https://example.invalid'}).status_code == 403


def test_default_portfolio_is_synthetic_and_session_only():
    portfolio = TestClient(create_app()).get('/api/portfolio').json()
    assert portfolio['synthetic'] is True
    assert len(portfolio['holdings']) == 10
    assert all('api_key' not in row for row in portfolio['holdings'])


def test_advice_api_uses_key_for_one_request_without_persisting(monkeypatch):
    row = {'代码': '000001', '基金名称': '测试基金'}
    monkeypatch.setattr(fund_service, 'analysis_rows', lambda: [row])
    seen = {}

    def advice(current_row, *, api_key_override=None, provider_override=None, return_status=False):
        seen.update(code=current_row['代码'], api_key=api_key_override, provider=provider_override)
        return ('本地提示', '不构成投资建议', 'local_fallback') if return_status else ('本地提示', '不构成投资建议')

    monkeypatch.setattr(fund_service.advisor, 'call_qwen_advice_pair', advice)
    client = TestClient(create_app())
    result = client.post('/api/funds/000001/advice', json={'api_key': 'secret-for-this-call', 'provider': 'glm'})
    assert result.status_code == 200
    assert seen == {'code': '000001', 'api_key': 'secret-for-this-call', 'provider': 'glm'}
    assert 'secret-for-this-call' not in str(client.get('/api/portfolio').json())


def test_portfolio_update_is_normalized_in_memory():
    client = TestClient(create_app())
    result = client.put('/api/portfolio', json={'holdings': [{'code': '6887', 'name': '测试基金', 'amount': 123, 'hold_ret': 1.5, 'cum_profit': 2}]})
    assert result.status_code == 200
    assert result.json()['synthetic'] is False
    assert result.json()['holdings'][0]['code'] == '006887'
    assert client.post('/api/portfolio/reset').json()['synthetic'] is True
