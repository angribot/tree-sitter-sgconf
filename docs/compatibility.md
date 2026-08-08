# Compatibility provenance

This record distinguishes public Surge syntax from behavior observed in one Surge build and from parser-only recovery guarantees. A passing Tree-sitter test is not, by itself, a claim that Surge accepts the source.

## Authorities and baselines

- Official manual index: <https://manual.nssurge.com/llms.txt>
- Manual reviewed: 2026-08-08 UTC
- Generated parser baseline: Tree-sitter CLI 0.26.11
- Accepted initial research baseline: Surge Mac 6.8, build 11980, core 6008000
- Committed-fixture revalidation: Surge Mac 6.8.0, build 11990, core 6008000, on 2026-08-07 UTC

Build 11990 was the formal release installed after the initial build 11980 research. The exact committed fixtures listed below were rechecked because the application changed. These versions record observations; the grammar does not reject documents based on a Surge version.

The compatibility record deliberately omits device identifiers, private profiles, remote-management data, system details, and raw command output.

## Fixture categories

The canonical fixture inventory is [`manifest.tsv`](../test/fixtures/compatibility/manifest.tsv). Each row records the fixture, expected parser outcome, expected local Surge checker outcome, expected top-level CST nodes, and either an official source or an explicit recovery rationale.

- `documented/` contains independently authored examples of syntax described by the official manual. It does not copy substantial manual excerpts.
- `surge-validated/` isolates behavior observed with the local `surge-cli --check` utility. Undocumented acceptance remains compatibility evidence, not supported public syntax.
- `recovery/` contains malformed or hypothetical extension syntax. These fixtures test preservation and bounded recovery only and are not submitted to Surge as validity claims.

The source column links each fixture to its most specific applicable page. The broader syntax claims exercised by the detailed Tree-sitter corpus map to these official sources:

| Claim family | Official source |
| --- | --- |
| Document structure, section inventory, assignments, comments, quoting, detached profiles, and Line Requirements | [Profile Format](https://manual.nssurge.com/profile/format.html) |
| Proxy policy and policy group declarations | [Policy Overview](https://manual.nssurge.com/policies/overview.html) and [Policy Group Overview](https://manual.nssurge.com/policy-groups/overview.html) |
| Ordered rules, recursive logical rules, and dynamic inline Ruleset sections | [Rules Overview](https://manual.nssurge.com/rules/overview.html), [Logical Rules](https://manual.nssurge.com/rules/logical.html), and [Ruleset](https://manual.nssurge.com/rules/ruleset.html) |
| URL, header, body, and local-response rewrite statements | [URL Rewrite](https://manual.nssurge.com/http/url-rewrite.html), [Header Rewrite](https://manual.nssurge.com/http/header-rewrite.html), [Body Rewrite](https://manual.nssurge.com/http/body-rewrite.html), and [Map Local](https://manual.nssurge.com/http/map-local.html) |
| Script, panel, subnet, and port-forwarding declarations | [Scripting Overview](https://manual.nssurge.com/scripting/overview.html), [Information Panel](https://manual.nssurge.com/tools/panel.html), [Subnet Settings](https://manual.nssurge.com/features/subnet-settings.html), and [Port Forwarding](https://manual.nssurge.com/features/port-forwarding.html) |
| WireGuard, Tailscale, and incoming-service sections | [WireGuard](https://manual.nssurge.com/policies/wireguard.html), [Tailscale](https://manual.nssurge.com/policies/tailscale.html), [MTProto](https://manual.nssurge.com/features/mtproto.html), and the [Profile Format section inventory](https://manual.nssurge.com/profile/format.html) |
| Managed-profile, Requirement, and forbidden-upgrade directives | [Managed Profile](https://manual.nssurge.com/profile/managed-profile.html) |
| Module metadata, merge operators, and placeholders | [Module](https://manual.nssurge.com/profile/module.html) |

Unknown syntax preservation and physical-line/section recovery are parser guarantees rather than declarations of Surge validity. They are traced to the `recovery/` fixtures and the section-dispatched syntax-only CST decision in [ADR 0001](adr/0001-section-dispatched-syntax-only-cst.md).

## Local Surge validation

The checker bundled with Surge Mac is expected at:

```text
/Applications/Surge.app/Contents/Applications/surge-cli
```

Run the recorded checks with:

```sh
npm run validate:surge
```

A different executable may be passed as the first argument or through `SURGE_CLI`. This command is a maintainer tool and is intentionally absent from hosted CI.

The build 11990 revalidation produced the following expected results:

| Fixture | Result | Compatibility claim |
| --- | --- | --- |
| `documented/profile.conf` | Accepted | An LF-terminated representative profile with all documented full-line comment forms, an inline comment, and escaped quoted data is accepted. |
| `documented/inline-ruleset.conf` | Accepted | A named inline Ruleset section is accepted. |
| `documented/logical-inline-ruleset.conf` | Accepted | A policy-free recursive logical entry in a named inline Ruleset section is accepted. |
| `documented/legacy-script.conf` | Accepted | The documented whitespace-delimited legacy Script declaration is accepted. |
| `documented/large-rule-profile.conf` | Accepted | The synthetic 10,001-rule profile is accepted. |
| `surge-validated/repeated-sections.conf` | Accepted | Repeated sections are accepted and remain separate parser nodes. |
| `surge-validated/unknown-extensions.conf` | Accepted | An unknown key and section are accepted by this build and preserved by the parser. |
| `surge-validated/dynamic-prefix-unknown-sections.conf` | Accepted | Unknown sections whose names begin with `Ruleset`, `WireGuard`, or `Tailscale` are accepted by this build and preserved as unknown sections rather than partially matching the named dynamic families. The official Profile Format separately guarantees that content in unrecognized sections is preserved without errors. |
| `surge-validated/structural-case-rejected.conf` | Rejected | Lowercase `[rule]` does not act as the structural `[Rule]` section. The parser preserves it as an unknown section. |
| `surge-validated/utf8-bom.conf` | Accepted | A UTF-8 BOM is accepted. |
| `surge-validated/crlf.conf` | Accepted | CRLF line endings are accepted. |
| `surge-validated/no-final-newline.conf` | Accepted | A final physical newline is not required. |
| `surge-validated/bracketed-url-rewrite.conf` | Accepted | An unquoted URL Rewrite regular expression containing a bracketed character class is accepted. |
| `surge-validated/incomplete-rule-rejected.conf` | Rejected | An ordinary Rule with a kind and matcher but no required policy is rejected, while the parser reports a line-local error and recovers at the following Rule and section. |

All other committed fixtures are marked `not-applicable`: module documents do not use the profile checker, managed/include examples would introduce external dependencies, and recovery fixtures intentionally do not claim Surge validity.

## Portable verification

Hosted CI has no Surge App or network dependency. `cargo test --test compatibility` reads every committed compatibility fixture through the exported `tree_sitter_sgconf::LANGUAGE`, checks the recorded parser error state and top-level CST shape, and fails if the manifest and fixture directories drift. Detailed syntax trees remain covered by the standard Tree-sitter corpus tests run by `npm test`.

`documented/large-rule-profile.conf` contains 10,000 independently generated domain rules followed by `FINAL,DIRECT`. The Rust compatibility test asserts a clean parse and exactly 10,001 public `rule` nodes. Local performance investigation may use:

```sh
npx tree-sitter parse --quiet --stat --time \
  test/fixtures/compatibility/documented/large-rule-profile.conf
```

No wall-clock threshold is enforced because timings are hardware-dependent. The fixture exists to expose error cascades or conspicuous scaling regressions during local comparison.
