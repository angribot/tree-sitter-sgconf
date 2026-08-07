//! This crate provides Surge Configuration Language support for the
//! [tree-sitter] parsing library.
//!
//! Typically, you will use the [`LANGUAGE`] constant to add this language to a
//! tree-sitter [`Parser`], and then use the parser to parse some code:
//!
//! ```
//! let source = "";
//! let mut parser = tree_sitter::Parser::new();
//! parser
//!     .set_language(&tree_sitter_sgconf::LANGUAGE.into())
//!     .expect("Error loading Surge Configuration Language parser");
//! let tree = parser.parse(source, None).unwrap();
//! assert!(!tree.root_node().has_error());
//! ```
//!
//! [`Parser`]: https://docs.rs/tree-sitter/0.26.11/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_sgconf() -> *const ();
}

/// The tree-sitter [`LanguageFn`] for this grammar.
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_sgconf) };

/// The content of the [`node-types.json`] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

#[cfg(test)]
mod tests {
    fn parser() -> tree_sitter::Parser {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading Surge Configuration Language parser");
        parser
    }

    #[test]
    fn empty_surge_configuration_document_parses() {
        let tree = parser().parse("", None).expect("parser returned no tree");
        let root = tree.root_node();

        assert_eq!(root.kind(), "source_file");
        assert!(!root.has_error());
    }

    #[test]
    fn common_encoding_and_line_endings_parse_consistently() {
        let cases = [
            ("UTF-8 BOM", "\u{feff}[General]\nopaque = value\n"),
            ("LF", "[General]\nopaque = value\n"),
            ("CRLF", "[General]\r\nopaque = value\r\n"),
            ("no final newline", "[General]\nopaque = value"),
        ];
        let mut parser = parser();

        for (name, source) in cases {
            let tree = parser.parse(source, None).expect("parser returned no tree");
            let root = tree.root_node();

            assert_eq!(
                root.to_sexp(),
                "(source_file (general_section (section_header) (unknown_line)))",
                "{name} produced an unexpected tree"
            );
            assert!(!root.has_error(), "{name} produced a parse error");
        }
    }

    #[test]
    fn structural_tokens_are_bounded_by_physical_lines() {
        let cases = [
            ("concatenated headers", "[General][Proxy]"),
            ("trailing header data", "[General] trailing data"),
            ("multiline dynamic header", "[Ruleset name\n]"),
            ("same-line comment", "[General] # not a full-line comment"),
            (
                "same-line directive",
                "[General]#!not-a-full-line-directive",
            ),
        ];
        let mut parser = parser();

        for (name, malformed) in cases {
            let source = format!("{malformed}\n[Rule]\nFINAL,DIRECT");
            let tree = parser
                .parse(&source, None)
                .expect("parser returned no tree");
            let root = tree.root_node();
            let mut cursor = root.walk();
            let recovered_rule_section = root
                .named_children(&mut cursor)
                .find(|node| node.kind() == "rule_section")
                .expect("recovery lost the later Rule section");

            assert!(root.has_error(), "{name} was accepted without an error");
            assert!(
                !recovered_rule_section.has_error(),
                "{name} contaminated the later Rule section"
            );
        }
    }

    #[test]
    fn dynamic_section_name_has_an_exact_source_range() {
        let source = "[Ruleset   Streaming Media  ]";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let section = tree
            .root_node()
            .named_child(0)
            .expect("missing Ruleset section");
        let header = section.named_child(0).expect("missing section header");
        let name = header
            .child_by_field_name("name")
            .expect("missing dynamic section name");
        let expected_start = source.find("Streaming").expect("missing expected name");
        let expected_end = expected_start + "Streaming Media".len();

        assert_eq!(name.byte_range(), expected_start..expected_end);
        assert_eq!(
            &source[name.byte_range()],
            "Streaming Media",
            "section name should exclude surrounding whitespace"
        );
    }
}
