# Security policy

## Supported versions

Only the latest release of the Agora Famille calendar integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-calendar-agorafamille](https://github.com/prohand/gladys-calendar-agorafamille/security), then
**Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only asks the
maintainers for a private contact, without any detail of the problem.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove passwords, cookies, e-mail addresses, children's names and
  invoice details first).

You should get a first answer within 7 days. A fix is released as a new version of the
integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), and the Agora
Famille portal and the services of Agora Plus (report to Agora Plus or to your municipality).

## What the integration handles

The integration handles personal data of a family: the portal credentials of each Gladys user
who enables it, the children's first names, their planning and the invoices.

- Each password is stored by Gladys as a secret field of its user's account. It is only sent to
  the portal of the municipality, over HTTPS, and never logged; neither are the session ids.
- The planning and the invoices only go to the Gladys calendar of the user who enabled the
  integration. A calendar starts private: the user decides whether the household sees it.
- Nothing is written to disk, and nothing is sent to any other service.

## Good practices for users

- Use a unique password for the family portal.
- Keep Gladys and the integration up to date.
- Turn **Detailed logs** off once a problem is solved, and remove personal data from logs before
  sharing them.
