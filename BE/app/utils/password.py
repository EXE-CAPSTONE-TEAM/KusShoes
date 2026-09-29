import bcrypt

_BCRYPT_ROUNDS = 12
# bcrypt băm tối đa 72 byte đầu vào; bản >=4 raise ValueError thay vì cắt âm thầm.
_BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    encoded = password.encode()
    if len(encoded) > _BCRYPT_MAX_BYTES:
        # Schema đăng ký/đổi mật khẩu đã chặn từ trước; đây là lớp phòng thủ cho các caller khác
        # (seed scripts, luồng nội bộ) để không phát sinh 500 khó chẩn đoán.
        raise ValueError("Mật khẩu không được vượt quá 72 byte khi mã hóa UTF-8")
    return bcrypt.hashpw(encoded, bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    encoded = password.encode()
    if len(encoded) > _BCRYPT_MAX_BYTES:
        # Không mật khẩu hợp lệ nào từng được lưu ở >72 byte, nên chuỗi dài hơn không thể khớp.
        # Trả False thay vì để bcrypt.checkpw raise và biến /login thành lỗi 500.
        return False
    return bcrypt.checkpw(encoded, password_hash.encode())
