# Next Question for Paseo

One editable Codex-powered follow-up question below a completed reply, running inside standard Paseo 0.13.x.

![Next Question component preview](assets/screenshot.png)

The screenshots render the shipped component with a sample conversation and a mocked host. Real daemon and Codex checks are recorded in [verification](VERIFICATION.md).

## Install

```sh
paseo plugin install git:JacksonHuang517/paseo-next-question-plugin
```

This source is submitted to the Paseo plugin directory; registry approval is separate from source publication. Requires plugins enabled and a current, configured Codex CLI on the daemon host. No custom desktop app is needed.

## Use

After a top-level agent finishes successfully, a suggestion row appears below the reply. Edit the question, then click **Send question**, or use **Copy**. Sending is always explicit and never replaces an existing composer draft. Use `/next-question` for an older conversation or to recreate the row after restarting the daemon. Failed or canceled turns and provider child agents do not create automatic rows. The current interface uses English action labels; generated questions follow the conversation's language.

Read [the overview](OVERVIEW.md) / [中文说明](OVERVIEW.zh-CN.md) for data access, costs, requirements and limitations. This version intentionally uses public timeline APIs rather than the private composer extension from the earlier custom desktop prototype.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run lint
```

All dependencies are development-only or supplied by Paseo at runtime. Installation has no build step and runs no lifecycle scripts. `server/` contains the Codex process and bounded context reader; `client/` contains the native timeline UI; `shared/` contains RPC schemas. The server validates the latest reply before generation, after generation and immediately before an explicit send. Generation is cached and canceled across simultaneous clients.

Do not add endpoints, credentials, local conversation dumps or identifying screenshot data to this repository. Release screenshots use a sample conversation. See [verification](VERIFICATION.md) for tested behavior and limits.
