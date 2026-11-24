import hmac

from fastapi import Header, HTTPException, Request, status


def require_access_code(
    request: Request,
    x_access_code: str | None = Header(default=None),
) -> None:
    expected = request.app.state.settings.access_code
    if not expected:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Access is not configured")
    supplied = (x_access_code or "").encode()
    if not hmac.compare_digest(supplied, expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access code")
