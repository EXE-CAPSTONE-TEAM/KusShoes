from app.api_docs import DOCS, TAGS
from app.main import app

_METHODS = {"get", "post", "put", "patch", "delete"}


def _operations() -> dict[str, dict]:
    spec = app.openapi()
    return {
        f"{method.upper()} {path}": op
        for path, item in spec["paths"].items()
        for method, op in item.items()
        if method in _METHODS
    }


def test_every_endpoint_is_documented():
    missing = [key for key in _operations() if key not in DOCS]
    assert not missing, f"Add entries to app/api_docs.py DOCS for: {missing}"


def test_no_stale_doc_entries():
    stale = [key for key in DOCS if key not in _operations()]
    assert not stale, f"DOCS entries for endpoints that no longer exist: {stale}"


def test_summaries_and_descriptions_are_meaningful():
    for key, op in _operations().items():
        assert len(op["summary"]) >= 5, key
        assert len(op["description"]) >= 20, key


def test_every_tag_is_described_and_declared():
    declared = {tag["name"] for tag in TAGS}
    used = {tag for op in _operations().values() for tag in op.get("tags", [])}
    assert used <= declared, f"Tags without a description: {used - declared}"
    assert all(tag["description"] for tag in TAGS)


def test_error_envelope_documented():
    spec = app.openapi()
    assert "ErrorResponse" in spec["components"]["schemas"]
    me = spec["paths"]["/api/v1/users/me"]["get"]
    assert {"401", "403"} <= set(me["responses"])
    assert "404" in spec["paths"]["/api/v1/projects/{project_id}"]["get"]["responses"]
