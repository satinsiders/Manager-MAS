# GitHub Hosting & Automation

This doc covers getting the repository into GitHub and configuring basic automation.

## 1. Create the GitHub repository
1. Sign in to GitHub and create a new repository (public or private) without any template files.
2. Copy the remote URL (e.g., `https://github.com/your-org/manager-mas.git`).

If this project is not yet a Git repo locally:
```bash
git init
```
Add the remote and push the current branch:
```bash
git remote add origin <remote-url>
git checkout -b main
git add .
git commit -m "Initial commit"
git push -u origin main
```
If the repo already exists, just push the current branch.

## 2. Set up required secrets
Visit **Settings > Secrets and variables > Actions** in GitHub and add the secrets your workflows or deploys require:
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPERFASTSAT_API_URL`
- `SUPERFASTSAT_API_TOKEN`
- `SUPERFASTSAT_TEACHER_EMAIL`
- `SUPERFASTSAT_TEACHER_PASSWORD`
- `ORCHESTRATOR_URL`
- `ORCHESTRATOR_SECRET`
- `SCHEDULER_SECRET`
- Any additional downstream URLs (`ASSIGNMENTS_URL`, etc.)

These names mirror the environment variables used by the app and Render blueprint.

## 3. Continuous Integration (CI)
This prep adds a workflow at `.github/workflows/ci.yml` that runs on every push and pull request:
- Installs dependencies
- Builds the TypeScript output
- Runs the comprehensive test suite (`npm test`)

Make sure the workflow succeeds before merging changes; hook Render auto-deploys to `main` only.

## 4. Protect main branches
In your GitHub repo settings:
1. Enable branch protection for `main` (require status checks to pass before merge).
2. Optionally require pull requests and PR reviews.
3. Restrict who can push directly to protected branches.

## 5. Optional: Environments & Deploy Keys
- Use GitHub Environments (e.g., `staging`, `production`) to require manual approval before Render deploys.
- Add a deploy key if you prefer Render to pull read-only from the repo instead of connecting your GitHub account directly.

## 6. Ongoing maintenance
- Keep lockfiles committed so Render and CI install identical dependency versions.
- Update secrets promptly when rotating credentials.
- Monitor Actions usage limits if the project is private.
