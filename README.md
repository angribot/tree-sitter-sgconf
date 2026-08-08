# tree-sitter-sgconf

`tree-sitter-sgconf` parses Surge configuration documents with Tree-sitter and provides a Rust binding plus syntax-highlighting queries.

## Scope

One grammar covers the three Surge document roles:

- **Profile** — a standalone Surge configuration document.
- **Detached profile** — sections included into another profile, commonly stored as `.dconf`.
- **Module** — a higher-priority profile patch, commonly stored as `.sgmodule`.

The parser exposes a section-dispatched, syntax-only concrete syntax tree (CST). It recognizes documented statement families, including modern and legacy Script declarations, logical rules, Line Requirements, module metadata, merge operators, and placeholders. Unknown sections and lines remain visible for forward compatibility; their preservation does not mean that Surge accepts them.

## Build and test

Tree-sitter CLI 0.26.11 is pinned by the npm lockfile. A C compiler and Rust 1.77 or newer are required for all checks.

```sh
npm ci
npm run generate
npm test
cargo test --locked
```

`npm test` runs both parser corpus tests and editor-facing highlight tests. See [`docs/compatibility.md`](docs/compatibility.md) for the evidence corpus and optional local `surge-cli` validation.

## Rust usage

Until the crate is published, depend on the repository directly:

```toml
[dependencies]
tree-sitter = "0.26.11"
tree-sitter-sgconf = { git = "https://github.com/angribot/tree-sitter-sgconf" }
```

Select `sgconf` explicitly when constructing a parser:

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let source = "[Rule]\nFINAL,DIRECT\n";
    let language = tree_sitter_sgconf::LANGUAGE.into();
    let mut parser = tree_sitter::Parser::new();
    parser.set_language(&language)?;

    let tree = parser.parse(source, None).expect("parser returned no tree");
    assert!(!tree.root_node().has_error());
    Ok(())
}
```

The Rust crate also exports `NODE_TYPES` and `HIGHLIGHTS_QUERY` for consumers that configure Tree-sitter directly.

## File detection and `.conf` conflicts

The Tree-sitter metadata declares `conf`, `dconf`, and `sgmodule` file types. The latter two are Surge-specific in normal use. The `.conf` suffix is shared by INI and many unrelated formats, so the metadata also supplies a conservative `content-regex` built from distinctive Surge directives and section headers.

Content detection is only a tie-breaker in integrations that honor `tree-sitter.json`. Integrations that ignore it **must not associate every `.conf` file with `sgconf` unconditionally**. Configure only known Surge paths or choose the language explicitly.

From this repository, `--grammar-path` explicitly selects the local grammar:

```sh
tree-sitter parse --grammar-path . profile.conf
tree-sitter highlight --grammar-path . profile.conf
```

After adding the grammar's parent directory to the Tree-sitter CLI `parser-directories` configuration, scope selection avoids extension ambiguity from any directory:

```sh
tree-sitter parse --scope source.sgconf profile.conf
tree-sitter highlight --scope source.sgconf profile.conf
```

A `.conf` document containing only generic headers such as `[General]` may intentionally not satisfy the conservative content regex; explicit selection is the correct fallback.

## Compatibility policy

The [Surge manual](https://manual.nssurge.com/llms.txt) is the public syntax authority. Scrubbed local `surge-cli --check` results supplement the manual where executable behavior matters; tests never require Surge or network access.

Named CST nodes and field names are a public compatibility surface. Changes to them require deliberate review because downstream queries and tools may depend on those names. Error recovery is line-bounded where practical so malformed or future syntax does not consume later valid statements or sections. Recognizable incomplete named and legacy Script declarations, Rule and inline Ruleset entries, rewrite statements, and whitespace-delimited statements produce localized `ERROR` nodes; genuinely unknown shapes remain available through `unknown_section`, `unknown_line`, and generic `directive` nodes without claiming semantic validity.

## Non-goals

This initial release does not provide semantic validation, reference resolution, formatting or rewriting, code actions, external Ruleset/resource parsing, crates.io publication, or non-Rust bindings. Highlighting is structural rather than reference-aware.

## License

MIT
