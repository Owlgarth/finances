# Security Policy

## Supported Versions

This is a personal open-source project maintained by one person and
currently at 0.x. Only the latest tagged release receives security fixes;
there are no backports.

| Version | Supported |
| ------- | --------- |
| Latest tagged release (`vX.Y.Z`) | Yes |
| `main` branch | No - development state; fixes ship in tagged releases |
| Older tagged releases | No - upgrade to the latest release |

## Reporting a Vulnerability

Report privately through GitHub's private vulnerability reporting: open the
[Security tab](https://github.com/Owlgarth/finances/security) and use the
"Report a vulnerability" form.

Please do not open public issues or pull requests for a vulnerability, and do
not discuss suspected vulnerabilities in public until a fix is released.

Include what you can:

- The affected component (backend, frontend, Docker configuration) and, if
  known, the release tag or commit you tested
- Steps to reproduce, or a proof of concept
- What an attacker could achieve (your read on the impact)

If you can, reproduce against a local self-hosted instance rather than the
hosted one at [finances.owlgarth.com](https://finances.owlgarth.com).

## What to Expect

Timelines are best effort - one maintainer, no security team:

- **Acknowledgment:** within 7 days of the report
- **Fix:** as soon as practical for the severity, in the next patch or minor
  release - no fixed SLA
- **Disclosure:** coordinated. Details stay private until a fix is released,
  then go out in a GitHub security advisory. You get credit in the advisory
  if you want it.

## Scope

In scope: vulnerabilities in the code shipped in this repository - backend,
frontend, and the bundled Docker configuration.

Out of scope:

- Unsupported versions - anything other than the latest tagged release
- Self-hosted misconfiguration - exposed database or storage ports, weak
  secrets, missing HTTPS, and similar deployment mistakes
- Availability of the hosted instance at
  [finances.owlgarth.com](https://finances.owlgarth.com) - no uptime
  commitments are made for it

If you are unsure whether something is in scope, report it anyway.
