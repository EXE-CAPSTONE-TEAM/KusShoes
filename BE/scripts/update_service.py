import os
import re

service_path = r"E:\FPTU\Semester-7\EXE\KusShoes_Refactor\BE_Refactor\app\services\admin_service.py"
with open(service_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add before_id to signatures
content = content.replace("before: datetime | None = None,", "before: datetime | None = None,\n    before_id: uuid.UUID | None = None,")

# Add before_id to repo calls
# We find `before=before` and replace with `before=before, before_id=before_id`
content = content.replace("before=before,", "before=before, before_id=before_id,")
content = content.replace("before=before\n", "before=before, before_id=before_id\n")
content = content.replace("before=before)", "before=before, before_id=before_id)")

with open(service_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated admin_service.py")
