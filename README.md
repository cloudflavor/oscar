# oscar

Oscar is a bot inspired by [Prow](https://docs.prow.k8s.io/docs/).
And just like Prow, Oscar is a bot that helps you manage your GitHub repositories.
It can answer to commands in the comments of your PRs and Issues such
as:

- `/assign`: Assigns a user to the PR or Issue. Without a user, it will assign the PR or
  Issue to the commenter.
- `/unassign`: Unassigns a user from the PR or Issue.
- `/merge`: Merges the PR. This depends on a few conditions such as the PR being
  approved, the jobs finishing successfully, the PR not having the `do-not-merge`
  label, the PR not being on hold, the PR not being a draft, the PR not having any
  conflicts, etc.
- `/close`: Closes the PR or Issue.
- `/reopen`: Reopens the PR or Issue.
- `/label`: Adds a label to the PR or Issue.
- `/triage`: Remove the `needs-triage` label from the PR or Issue.
- `/rename`: Renames the PR or Issue.
- `/reviewers`: Adds reviewers to the PR.
- `/restart-workflow`: Restarts the workflow of the PR.
- `/stop-workflow`: Stops the workflow of the PR.
- `/cancel-workflow`: Force cancels the workflow of the PR. Use this only if the workflow
  is stuck.
- `/restart-job`: Restarts a specific job of the PR.
- `/hold` and `/unhold`: Puts the PR on hold or removes it from hold. This is useful when
  you want to prevent the PR from being merged.

## GitHub app

Oscar can be run as a GitHub app. This is the recommended way to run Oscar as it is
easier to set up and maintain.
Integrating with GitLab and Gitea is planned for the near future.

## Cloudflare workers

Oscar's advantage is that it can be deployed and used for free on cloudflare workers. The
free tier of cloudflare workers is enough to run Oscar for most repositories (100k
requests/day).
And in extreme cases, you can always pay for the pro plan or enable load balancing to 
spread requests across multiple workers.
