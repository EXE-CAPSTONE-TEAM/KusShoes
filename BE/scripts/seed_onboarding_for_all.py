import asyncio
import logging

from app.database import AsyncSessionLocal
from app.services import onboarding_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_onboarding")


async def main() -> None:
    logger.info("Starting onboarding demo project backfill for all existing users...")
    async with AsyncSessionLocal() as db:
        count = await onboarding_service.seed_all_existing_users(db)
        logger.info("Backfill complete! Seeded 'My sneaker' project for %d users.", count)


if __name__ == "__main__":
    asyncio.run(main())
