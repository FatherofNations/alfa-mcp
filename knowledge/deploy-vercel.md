# Deployment
Reuse the user's explicit publishing authorization and the project's established deployment workflow.
Before publishing, check the exact commit, build, required QA coverage and current deviations.
Inspect installed Next.js/Vercel versions and current output structure; do not apply legacy cleanup or framework workarounds blindly.
Never delete build output used by a running server without coordinating that process.
Keep secrets out of logs and commits. Do not change access protection or make a project public unless requested.
Verify the actual deployed URL and revision after deployment; distinguish preview from production.
Report unverified motion or visual coverage separately from deployment success.

