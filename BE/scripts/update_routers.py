import os
import re

router_files = [
    r"E:\FPTU\Semester-7\EXE\KusShoes_Refactor\BE_Refactor\app\routers\admin_users.py",
    r"E:\FPTU\Semester-7\EXE\KusShoes_Refactor\BE_Refactor\app\routers\admin_billing.py",
    r"E:\FPTU\Semester-7\EXE\KusShoes_Refactor\BE_Refactor\app\routers\admin_ops.py",
]

def process_file(path):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Add imports
    if "CursorPage" not in content:
        content = content.replace("from app.schemas.admin import (", "from app.schemas.admin import (\n    CursorPage,")
    if "CursorPage" not in content:  # If the format is different, e.g. admin_billing might not import from admin
        content = content.replace("from app.schemas.subscription import (", "from app.schemas.admin import CursorPage\nfrom app.schemas.subscription import (")

    if "decode_cursor" not in content:
        content = "from app.utils.pagination import decode_cursor, encode_cursor\n" + content

    # Replace parameter signature
    content = content.replace("before: datetime | None = None,", "cursor: str | None = None,")
    
    # We will match the router endpoint functions and rewrite the body to extract before, before_id and return CursorPage
    # This is tricky with regex, so let's do it by finding `return await admin_service.list_` or `return await admin_service.`
    
    def repl_func(m):
        func_def = m.group(1)
        response_model = m.group(2)
        func_body_start = m.group(3)
        service_call = m.group(4)
        
        # Change response_model from list[X] to CursorPage[X]
        new_func_def = func_def.replace(f"response_model=list[{response_model}]", f"response_model=CursorPage[{response_model}]")
        
        # Build new body
        new_body = f"""{new_func_def}{func_body_start}
    before = None
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded

    items = await {service_call.replace('before=before', 'before=before, before_id=before_id')}
    
    next_cursor = None
    if items:
        last_item = items[-1]
        next_cursor = encode_cursor(last_item.created_at, last_item.id)

    return CursorPage(items=items, next_cursor=next_cursor)
"""
        return new_body

    pattern = r"(@router\.get[^\n]*?response_model=list\[([A-Za-z0-9_]+)\][^\n]*\n(?:[ \t]*async def[^\n]+\n)*?(?:[ \t]+[^\n]+\n)*?)(:[ \t]*\n(?:[ \t]*\"\"\"[^\n]*\"\"\"\n)?)[ \t]*return await (admin_service\.[A-Za-z0-9_]+\([^\)]+\))"
    
    # This regex might not be perfect. Let's do a more robust search and replace.
    # Actually, writing a python AST transformer or just doing it with simple split is better.
    pass

# We will just write a specific script using re or string replace for each endpoint.
