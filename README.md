# oscar

Oscar is a bot inspired by [Prow](https://docs.prow.k8s.io/docs/).
And just like Prow, Oscar is a bot that helps you manage your GitHub repositories.
It can answer to commands in the comments of your PRs and Issues such
as:

- `/assign`: Assigns a user to the PR or Issue. Without a user, it will assign the PR or
  Issue to the commenter.
- `/unassign`: Unassigns a user from the PR or Issue.
- `/merge`: Merges the PR. This depends on a few conditions such as the PR being
  approved, the jobs finishing successfully and the PR not having the `do-not-merge`
  label. 
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
