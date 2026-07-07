import os
import re

ops_path = r"E:\FPTU\Semester-7\EXE\KusShoes_Refactor\BE_Refactor\app\routers\admin_ops.py"
with open(ops_path, "r", encoding="utf-8") as f:
    content = f.read()

# Imports
if "CursorPage" not in content:
    content = content.replace("    AdminBakeJobDetailResponse,", "    CursorPage,\n    AdminBakeJobDetailResponse,")
if "decode_cursor" not in content:
    content = "from app.utils.pagination import decode_cursor, encode_cursor\n" + content

# Function generator
def make_replacement(endpoint_name, model_name, service_func_name):
    old_sig = f"before: datetime | None = None,"
    new_sig = f"cursor: str | None = None,"
    
    # We replace manually by finding the start of the function
    # It's better to just do simple string replacements for each block.
    pass

# We will just write the replacements directly
# list_projects
content = re.sub(
    r"@router\.get\(\"/projects\", response_model=list\[AdminProjectListItem\]\)([\s\S]*?)before: datetime \| None = None,([\s\S]*?)return await admin_service\.list_projects_admin\([\s\S]*?before=before,\n    \)",
    r"""@router.get("/projects", response_model=CursorPage[AdminProjectListItem])\1cursor: str | None = None,\2before = None
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded
            
    items = await admin_service.list_projects_admin(
        db, user_id=user_id, status=status, q=q,
        include_deleted=include_deleted, limit=limit, before=before, before_id=before_id,
    )
    next_cursor = None
    if len(items) == limit:
        last = items[-1]
        next_cursor = encode_cursor(last.created_at, last.id)
    return CursorPage(items=items, next_cursor=next_cursor)""",
    content
)

# list_bake_jobs
content = re.sub(
    r"@router\.get\(\"/bake-jobs\", response_model=list\[AdminBakeJobResponse\]\)([\s\S]*?)before: datetime \| None = None,([\s\S]*?)return await admin_service\.list_bake_jobs\([\s\S]*?before=before\n    \)",
    r"""@router.get("/bake-jobs", response_model=CursorPage[AdminBakeJobResponse])\1cursor: str | None = None,\2before = None
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded
            
    items = await admin_service.list_bake_jobs(
        db, status=status, priority=priority, project_id=project_id, limit=limit, before=before, before_id=before_id
    )
    next_cursor = None
    if len(items) == limit:
        last = items[-1]
        next_cursor = encode_cursor(last.queued_at, last.id)
    return CursorPage(items=items, next_cursor=next_cursor)""",
    content
)

# list_exports
content = re.sub(
    r"@router\.get\(\"/exports\", response_model=list\[AdminExportRecordResponse\]\)([\s\S]*?)before: datetime \| None = None,([\s\S]*?)return await admin_service\.list_exports_admin\([\s\S]*?before=before\n    \)",
    r"""@router.get("/exports", response_model=CursorPage[AdminExportRecordResponse])\1cursor: str | None = None,\2before = None
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded
            
    items = await admin_service.list_exports_admin(
        db, user_id=user_id, project_id=project_id, format=format, limit=limit, before=before, before_id=before_id
    )
    next_cursor = None
    if len(items) == limit:
        last = items[-1]
        next_cursor = encode_cursor(last.created_at, last.id)
    return CursorPage(items=items, next_cursor=next_cursor)""",
    content
)

# list_audit_logs
content = re.sub(
    r"@router\.get\(\"/audit-logs\", response_model=list\[AuditLogResponse\]\)([\s\S]*?)before: datetime \| None = None,([\s\S]*?)return await admin_service\.list_audit_logs\([\s\S]*?before=before,\n    \)",
    r"""@router.get("/audit-logs", response_model=CursorPage[AuditLogResponse])\1cursor: str | None = None,\2before = None
    before_id = None
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            before, before_id = decoded
            
    items = await admin_service.list_audit_logs(
        db,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        q=q,
        limit=limit,
        before=before,
        before_id=before_id,
    )
    next_cursor = None
    if len(items) == limit:
        last = items[-1]
        next_cursor = encode_cursor(last.created_at, last.id)
    return CursorPage(items=items, next_cursor=next_cursor)""",
    content
)


with open(ops_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated admin_ops.py")
