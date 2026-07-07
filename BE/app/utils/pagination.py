import base64
import json
import uuid
from datetime import datetime, timezone

def encode_cursor(dt: datetime, record_id: uuid.UUID | str) -> str:
    """Mã hóa datetime và ID thành chuỗi opaque cursor an toàn (urlsafe)."""
    # Đảm bảo dt có múi giờ, sau đó chuyển về UTC timestamp float
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    
    data = {
        "ts": dt.timestamp(),
        "id": str(record_id)
    }
    json_bytes = json.dumps(data).encode("utf-8")
    return base64.urlsafe_b64encode(json_bytes).decode("ascii").rstrip("=")

def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID] | None:
    """Giải mã cursor thành (datetime, UUID). Trả về None nếu không hợp lệ."""
    if not cursor:
        return None
    try:
        # Thêm padding nếu thiếu
        padding = 4 - (len(cursor) % 4)
        if padding != 4:
            cursor += "=" * padding
            
        json_bytes = base64.urlsafe_b64decode(cursor.encode("ascii"))
        data = json.loads(json_bytes)
        
        dt = datetime.fromtimestamp(data["ts"], tz=timezone.utc)
        record_id = uuid.UUID(data["id"])
        return dt, record_id
    except Exception:
        return None
