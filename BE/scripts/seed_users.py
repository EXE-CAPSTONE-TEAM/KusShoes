import asyncio

from app.database import AsyncSessionLocal
from app.repositories import monthly_usage_repo, plan_repo, subscription_repo, user_repo
from app.utils.password import hash_password


async def seed_users():
    async with AsyncSessionLocal() as db:
        users_to_create = [
            {
                "email": "admin2@kusshoes.vn",
                "username": "admin2",
                "role": "admin",
                "first_name": "System",
                "last_name": "Admin",
            },
            {
                "email": "staff1@kusshoes.vn",
                "username": "staff1",
                "role": "staff",
                "first_name": "Store",
                "last_name": "Staff",
            },
        ]

        for i in range(1, 9):
            users_to_create.append(
                {
                    "email": f"user{i}@example.com",
                    "username": f"user{i}",
                    "role": "user",
                    "first_name": "Test",
                    "last_name": f"User {i}",
                }
            )

        password_hash = hash_password("password123")
        free_plan = await plan_repo.get_free_plan(db)

        for u in users_to_create:
            existing = await user_repo.get_by_email_any(db, u["email"])
            if existing:
                print(f"User {u['email']} already exists. Skipping.")
                continue

            user = await user_repo.create_email_user(
                db,
                email=u["email"],
                username=u["username"],
                password_hash=password_hash,
                first_name=u["first_name"],
                last_name=u["last_name"],
                role=u["role"],
            )
            user.is_verified = True

            if free_plan:
                await subscription_repo.create_free(db, user_id=user.id, plan_id=free_plan.id)
            await monthly_usage_repo.create_for_user(db, user_id=user.id)

            print(f"Created {u['role']}: {user.email}")

        await db.commit()
        print("Successfully seeded users.")


if __name__ == "__main__":
    asyncio.run(seed_users())
