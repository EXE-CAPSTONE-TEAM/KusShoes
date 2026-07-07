import os
import re

repos = [
    "user_repo.py",
    "project_repo.py",
    "bake_job_repo.py",
    "export_record_repo.py",
    "audit_log_repo.py",
    "subscription_repo.py",
    "invoice_repo.py",
]
base_dir = r"E:\FPTU\Semester-7\EXE\KusShoes_Refactor\BE_Refactor\app\repositories"

for repo in repos:
    path = os.path.join(base_dir, repo)
    if not os.path.exists(path):
        continue
    
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # 1. Add before_id: uuid.UUID | None = None to list_admin or list_all
    # We look for `before: datetime | None = None,`
    if "before_id" not in content and "before:" in content:
        content = content.replace("before: datetime | None = None,", "before: datetime | None = None,\n    before_id: uuid.UUID | None = None,")
    
    # 2. Update the where clause
    # Look for:
    # if before is not None:
    #     query = query.where(Model.created_at < before)
    # OR similar
    
    # We can use regex to find `if before is not None:\n        query = query.where(X.Y < before)`
    # and replace with:
    # if before is not None:
    #     if before_id is not None:
    #         query = query.where((X.Y < before) | ((X.Y == before) & (X.id < before_id)))
    #     else:
    #         query = query.where(X.Y < before)
    
    def repl(m):
        indent = m.group(1)
        model_field = m.group(2)
        model = model_field.split('.')[0]
        return f"{indent}if before is not None:\n{indent}    if before_id is not None:\n{indent}        query = query.where(({model_field} < before) | (({model_field} == before) & ({model}.id < before_id)))\n{indent}    else:\n{indent}        query = query.where({model_field} < before)"

    pattern = r"([ \t]+)if before is not None:\s+query = query.where\(([A-Za-z_]+\.[a-z_]+) < before\)"
    content = re.sub(pattern, repl, content)

    # Some might use `if before:` instead of `if before is not None:`
    pattern2 = r"([ \t]+)if before:\s+query = query.where\(([A-Za-z_]+\.[a-z_]+) < before\)"
    content = re.sub(pattern2, repl, content)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Updated {repo}")
