# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.9.x   | Yes |
| < 0.9.0 | No. Upgrade. Write tools in 0.8.0 and earlier send Partner API mutations with no confirmation gate. |

## Reporting a Vulnerability

Use GitHub private vulnerability reporting for this repository:

1. Open the Security tab on [TMHSDigital/steam-mcp](https://github.com/TMHSDigital/steam-mcp).
2. Choose Report a vulnerability and file a private advisory.

Do not file a public issue, discussion, or pull request that includes exploit details for an undisclosed vulnerability.

## Response window

We aim to acknowledge reports within 5 business days. We will keep the reporter updated as we reproduce, patch, and publish.

## Coordinated disclosure

This project follows coordinated disclosure. We typically request about 90 days to ship a patch and release notes before a public writeup. We will not share reporter contact details or unpublished technical detail outside of people who need them to fix the issue.

## Past advisories

| Advisory | Summary | Affected | Fixed in |
|----------|---------|----------|----------|
| [GHSA-cwcq-65mg-v26r](https://github.com/TMHSDigital/steam-mcp/security/advisories/GHSA-cwcq-65mg-v26r) | Ungated Steam Partner API write tools in the default MCP server bin | <= 0.8.0 | 0.9.0 |

## Acknowledgments

Reported by Syed Anas Mohiuddin, Independent Researcher, Maintainer of mcp-safeguard

Disclosed as part of an MCP-server security research effort.
