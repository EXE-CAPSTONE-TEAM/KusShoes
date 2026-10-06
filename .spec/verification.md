# Harness Verification Strategy

## Verification Steps
1. Execute `codegraph sync .` to update dependency index.
2. Run in-project harness `./harness/verify.sh` to execute tests, linters, type checks, and build checks.
3. Confirm zero test failures (Exit Code 0).
4. If failures occur, check logs, apply fixes, and re-verify before marking tickets complete.
