#!/usr/bin/env bash
set -euo pipefail

repo=TBD-APS/mrsoftware-website
path=roadmap/index.html
prefix=roadmap-code-sync-
: "${GH_TOKEN:?Set PUBLIC_ROADMAP_GH_TOKEN to an approved website automation credential}"
test "${GITHUB_ACTIONS:-}" = true
test "${GITHUB_REPOSITORY:-}" = "$repo"
test "${GITHUB_REF:-}" = refs/heads/main
test "$(git diff --name-only)" = "$path"
test -z "$(git diff --cached --name-only)"
base="$(git rev-parse HEAD)"
test "$base" = "${GITHUB_SHA:?Missing checked-out main SHA}"
test "$(gh api "repos/$repo/git/ref/heads/main" --jq .object.sha)" = "$base"

# Review one snapshot at a time. New status changes are picked up on the
# next poll after the existing proposal is resolved.
open="$(gh api --paginate "repos/$repo/pulls?state=open&base=main&per_page=100" \
  --jq ".[] | select(.head.repo.full_name == \"$repo\" and (.head.ref | startswith(\"$prefix\"))) | .number")"
if [[ -n "$open" ]]; then
  echo 'A public roadmap proposal is already awaiting review.'
  exit 0
fi

git add -- "$path"
tree="$(git write-tree)"
branch="$prefix${base:0:8}-${tree:0:12}"
previous="$(gh pr list --repo "$repo" --base main --head "$branch" --state all --json isCrossRepository \
  --jq '.[] | select(.isCrossRepository | not)')"
if [[ -n "$previous" ]]; then
  echo 'This exact proposal was previously reviewed or closed.'
  exit 0
fi

remote="$(git ls-remote origin "refs/heads/$branch")"
if [[ -n "$remote" ]]; then
  # Recover a branch left by a failed PR creation only if it is our exact tree.
  git fetch --no-tags origin "refs/heads/$branch"
  test "$(git rev-parse FETCH_HEAD^1)" = "$base"
  test "$(git rev-parse 'FETCH_HEAD^{tree}')" = "$tree"
else
  git -c user.name='MR Software roadmap' -c user.email='roadmap@users.noreply.github.com' \
    commit -m 'Refresh the public feature roadmap' -m 'Regenerate reviewed website copy using current Linear workflow states.'
  git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin "HEAD:refs/heads/$branch"
fi
gh pr create --repo "$repo" --base main --head "$branch" \
  --title '[roadmap 1/1] Refresh the public feature roadmap' --body-file - <<'BODY'
Refresh the public feature list using current Linear workflow states and the reviewed public copy in this repository.

The website suite passed on the proposed page. Review the feature and stage changes before merging through the normal website release flow.
BODY
