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

/// The syntax-highlighting query for this language.
pub const HIGHLIGHTS_QUERY: &str = include_str!("../../queries/highlights.scm");

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
                "(source_file (general_section (section_header) (assignment key: (key) value: (bare_value))))",
                "{name} produced an unexpected tree"
            );
            assert!(!root.has_error(), "{name} produced a parse error");
        }
    }

    #[test]
    fn declaration_fields_preserve_exact_source_ranges() {
        let source = "[Proxy]\nOffice HTTP = https, proxy.example.com, 443, username=user\n";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let section = tree.root_node().named_child(0).expect("missing section");
        let declaration = section.named_child(1).expect("missing named declaration");
        let name = declaration
            .child_by_field_name("name")
            .expect("missing declaration name");
        let mut argument_cursor = declaration.walk();
        let arguments: Vec<_> = declaration
            .children_by_field_name("argument", &mut argument_cursor)
            .map(|node| &source[node.byte_range()])
            .collect();
        let mut parameter_cursor = declaration.walk();
        let parameters: Vec<_> = declaration
            .children_by_field_name("parameter", &mut parameter_cursor)
            .collect();
        let parameter = parameters.first().expect("missing named parameter");
        let key = parameter
            .child_by_field_name("key")
            .expect("missing parameter key");
        let value = parameter
            .child_by_field_name("value")
            .expect("missing parameter value");

        assert_eq!(&source[name.byte_range()], "Office HTTP");
        assert_eq!(arguments, ["https", "proxy.example.com", "443"]);
        assert_eq!(&source[parameter.byte_range()], "username=user");
        assert_eq!(&source[key.byte_range()], "username");
        assert_eq!(&source[value.byte_range()], "user");
        assert!(!tree.root_node().has_error());
    }

    #[test]
    fn legacy_script_fields_preserve_exact_source_ranges() {
        let source = "[Script]\nhttp-response ^http://example.com/[0-9]+ script-path=x.js,requires-body=true\n";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let section = tree.root_node().named_child(0).expect("missing section");
        let declaration = section
            .named_child(1)
            .expect("missing legacy Script declaration");
        let script_type = declaration
            .child_by_field_name("type")
            .expect("missing script type");
        let value = declaration
            .child_by_field_name("value")
            .expect("missing script value");
        let mut parameter_cursor = declaration.walk();
        let parameters: Vec<_> = declaration
            .children_by_field_name("parameter", &mut parameter_cursor)
            .collect();

        assert_eq!(parameters.len(), 2);

        let first_parameter_key = parameters[0]
            .child_by_field_name("key")
            .expect("missing first parameter key");
        let first_parameter_value = parameters[0]
            .child_by_field_name("value")
            .expect("missing first parameter value");

        assert_eq!(declaration.kind(), "legacy_script_declaration");
        assert_eq!(&source[script_type.byte_range()], "http-response");
        assert_eq!(&source[value.byte_range()], "^http://example.com/[0-9]+");
        assert_eq!(&source[parameters[0].byte_range()], "script-path=x.js");
        assert_eq!(&source[first_parameter_key.byte_range()], "script-path");
        assert_eq!(&source[first_parameter_value.byte_range()], "x.js");
        assert_eq!(&source[parameters[1].byte_range()], "requires-body=true");
        assert!(!tree.root_node().has_error());
    }

    #[test]
    fn rule_fields_preserve_exact_source_ranges() {
        let source = "[Rule]\nDOMAIN-SUFFIX,example.com,Primary Policy,no-resolve,notification-text=Matched\n";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let section = tree.root_node().named_child(0).expect("missing section");
        let rule = section.named_child(1).expect("missing rule");
        let kind = rule.child_by_field_name("kind").expect("missing rule kind");
        let argument = rule
            .child_by_field_name("argument")
            .expect("missing rule argument");
        let policy = rule
            .child_by_field_name("policy")
            .expect("missing rule policy");
        let option = rule
            .child_by_field_name("option")
            .expect("missing rule option");
        let parameter = rule
            .child_by_field_name("parameter")
            .expect("missing rule parameter");

        assert_eq!(&source[kind.byte_range()], "DOMAIN-SUFFIX");
        assert_eq!(&source[argument.byte_range()], "example.com");
        assert_eq!(&source[policy.byte_range()], "Primary Policy");
        assert_eq!(&source[option.byte_range()], "no-resolve");
        assert_eq!(&source[parameter.byte_range()], "notification-text=Matched");
        assert!(!tree.root_node().has_error());
    }

    #[test]
    fn rewrite_arguments_preserve_bracketed_source_ranges() {
        let source = "[URL Rewrite]\n^https?://example.com/[0-9]+ _ reject\n";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let section = tree.root_node().named_child(0).expect("missing section");
        let rewrite = section.named_child(1).expect("missing rewrite");
        let mut argument_cursor = rewrite.walk();
        let arguments: Vec<_> = rewrite
            .children_by_field_name("argument", &mut argument_cursor)
            .map(|node| &source[node.byte_range()])
            .collect();

        assert_eq!(arguments, ["^https?://example.com/[0-9]+", "_", "reject"]);
        assert!(!tree.root_node().has_error());
    }

    #[test]
    fn unicode_values_preserve_exact_source_ranges() {
        let source = "[General]\ndisplay-name = 東京 café\n[URL Rewrite]\n^https://例え.test/[一-龯]+ _ reject\n";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let root = tree.root_node();
        let general_section = root.named_child(0).expect("missing General section");
        let assignment = general_section
            .named_child(1)
            .expect("missing Unicode assignment");
        let assignment_value = assignment
            .child_by_field_name("value")
            .expect("missing assignment value");
        let rewrite_section = root.named_child(1).expect("missing URL Rewrite section");
        let rewrite = rewrite_section.named_child(1).expect("missing rewrite");
        let pattern = rewrite
            .child_by_field_name("argument")
            .expect("missing rewrite pattern");

        assert_eq!(&source[assignment_value.byte_range()], "東京 café");
        assert_eq!(&source[pattern.byte_range()], "^https://例え.test/[一-龯]+");
        assert!(!root.has_error());
    }

    #[test]
    fn malformed_statement_families_have_local_errors_and_exact_recovery_ranges() {
        let source = "[Proxy]\nbroken = http,\nvalid = direct\n\
[Rule]\nDOMAIN-SUFFIX,example.com\nDOMAIN,valid.example,DIRECT\n\
[Ruleset Recovery]\nDOMAIN-SUFFIX,\nDOMAIN,valid.example\n\
[URL Rewrite]\npattern-only\n^http://old.example https://new.example\n\
[Header Rewrite]\nhttp-response pattern-only\nhttp-response ^https://valid.example header-del X-Test\n\
[Body Rewrite]\nhttp-response pattern-only\nhttp-response ^https://valid.example {}\n\
[Map Local]\npattern-only\n^https://valid.example data={}\n\
[SSID Setting]\nSSID:MissingParameters\nSSID:Valid suspend=true\n\
[Port Forwarding]\n127.0.0.1:1\n127.0.0.1:1 localhost:1\n\
[General]\nrecovered = true\n";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let root = tree.root_node();
        let expectations = [
            ("named_declaration", "broken = http,", "valid = direct"),
            (
                "rule",
                "DOMAIN-SUFFIX,example.com",
                "DOMAIN,valid.example,DIRECT",
            ),
            (
                "ordered_comma_statement",
                "DOMAIN-SUFFIX,",
                "DOMAIN,valid.example",
            ),
            (
                "rewrite",
                "pattern-only",
                "^http://old.example https://new.example",
            ),
            (
                "rewrite",
                "http-response pattern-only",
                "http-response ^https://valid.example header-del X-Test",
            ),
            (
                "rewrite",
                "http-response pattern-only",
                "http-response ^https://valid.example {}",
            ),
            ("rewrite", "pattern-only", "^https://valid.example data={}"),
            (
                "whitespace_statement",
                "SSID:MissingParameters",
                "SSID:Valid suspend=true",
            ),
            (
                "whitespace_statement",
                "127.0.0.1:1",
                "127.0.0.1:1 localhost:1",
            ),
        ];

        assert!(root.has_error());
        for (section_index, (recovered_kind, malformed_source, recovered_source)) in
            expectations.into_iter().enumerate()
        {
            let section_index =
                u32::try_from(section_index).expect("structured section index exceeds u32");
            let section = root
                .named_child(section_index)
                .expect("missing structured section");
            let malformed = section.named_child(1).expect("missing malformed statement");
            let recovered = section.named_child(2).expect("missing recovered statement");

            let section_range = section.byte_range();
            let malformed_line_start = section_range.start
                + source[section_range]
                    .find(malformed_source)
                    .expect("missing malformed source line");
            let malformed_line_end = malformed_line_start + malformed_source.len();

            assert_eq!(malformed.kind(), "ERROR");
            assert!(malformed.start_byte() >= malformed_line_start);
            assert!(malformed.end_byte() <= malformed_line_end);
            assert!(malformed.has_error());
            assert_eq!(recovered.kind(), recovered_kind);
            assert_eq!(&source[recovered.byte_range()], recovered_source);
            assert!(!recovered.has_error());
        }

        let general_section_index =
            u32::try_from(expectations.len()).expect("General section index exceeds u32");
        let general_section = root
            .named_child(general_section_index)
            .expect("missing recovered General section");
        assert_eq!(general_section.kind(), "general_section");
        assert_eq!(
            &source[general_section.byte_range()],
            "[General]\nrecovered = true"
        );
        assert!(!general_section.has_error());
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
    fn dynamic_family_prefix_collisions_preserve_exact_unknown_section_ranges() {
        let source = "[RulesetX]\nopaque = ruleset-x\n\
[Ruleset-Extension]\nopaque ruleset extension\n\
[WireGuardX]\nopaque = wireguard-x\n\
[TailscaleX]\nopaque tailscale-x\n\
[Ruleset]\nopaque bare ruleset\n\
[WireGuard]\nopaque = bare wireguard\n\
[Tailscale]\nopaque bare tailscale\n\
[Ruleset   ]\nopaque spaced ruleset\n\
[WireGuard   ]\nopaque spaced wireguard\n\
[Tailscale   ]\nopaque spaced tailscale\n\
[General]\nrecovered = true\n";
        let expected_unknown_sections = [
            ("RulesetX", "[RulesetX]\nopaque = ruleset-x"),
            (
                "Ruleset-Extension",
                "[Ruleset-Extension]\nopaque ruleset extension",
            ),
            ("WireGuardX", "[WireGuardX]\nopaque = wireguard-x"),
            ("TailscaleX", "[TailscaleX]\nopaque tailscale-x"),
            ("Ruleset", "[Ruleset]\nopaque bare ruleset"),
            ("WireGuard", "[WireGuard]\nopaque = bare wireguard"),
            ("Tailscale", "[Tailscale]\nopaque bare tailscale"),
            ("Ruleset", "[Ruleset   ]\nopaque spaced ruleset"),
            ("WireGuard", "[WireGuard   ]\nopaque spaced wireguard"),
            ("Tailscale", "[Tailscale   ]\nopaque spaced tailscale"),
        ];
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let root = tree.root_node();

        for (index, (expected_name, expected_source)) in
            expected_unknown_sections.into_iter().enumerate()
        {
            let section = root
                .named_child(u32::try_from(index).expect("section index exceeds u32"))
                .expect("missing unknown section");
            let header = section.named_child(0).expect("missing section header");
            let name = header
                .child_by_field_name("name")
                .expect("missing unknown section name");

            let expected_header = expected_source
                .lines()
                .next()
                .expect("unknown section source has no header");

            assert_eq!(section.kind(), "unknown_section");
            assert_eq!(&source[section.byte_range()], expected_source);
            assert_eq!(&source[header.byte_range()], expected_header);
            assert_eq!(&source[name.byte_range()], expected_name);
            assert!(!section.has_error());
        }

        let general_section = root
            .named_child(10)
            .expect("missing recovered General section");
        assert_eq!(general_section.kind(), "general_section");
        assert_eq!(
            &source[general_section.byte_range()],
            "[General]\nrecovered = true"
        );
        assert!(!root.has_error());
    }

    #[test]
    fn valid_dynamic_section_names_have_exact_source_ranges() {
        let source = "[Ruleset   Streaming Media  ]\n\
[WireGuard   office tunnel  ]\n\
[Tailscale   personal mesh  ]";
        let expected_sections = [
            (
                "ruleset_section",
                "[Ruleset   Streaming Media  ]",
                "Streaming Media",
            ),
            (
                "wireguard_section",
                "[WireGuard   office tunnel  ]",
                "office tunnel",
            ),
            (
                "tailscale_section",
                "[Tailscale   personal mesh  ]",
                "personal mesh",
            ),
        ];
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let root = tree.root_node();

        for (index, (expected_kind, expected_header, expected_name)) in
            expected_sections.into_iter().enumerate()
        {
            let section = root
                .named_child(u32::try_from(index).expect("section index exceeds u32"))
                .expect("missing dynamic section");
            let header = section.named_child(0).expect("missing section header");
            let name = header
                .child_by_field_name("name")
                .expect("missing dynamic section name");

            assert_eq!(section.kind(), expected_kind);
            assert_eq!(&source[section.byte_range()], expected_header);
            assert_eq!(&source[header.byte_range()], expected_header);
            assert_eq!(&source[name.byte_range()], expected_name);
            assert!(!section.has_error());
        }

        assert!(!root.has_error());
    }

    #[test]
    fn malformed_dynamic_header_recovers_at_a_statement_and_following_section() {
        let source = "[Ruleset Broken\nDOMAIN,valid.example\n[Rule]\nFINAL,DIRECT";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let root = tree.root_node();
        let ruleset_section = root
            .named_child(0)
            .expect("missing malformed Ruleset section");
        let malformed_header = ruleset_section
            .named_child(0)
            .expect("missing malformed Ruleset header");
        let recovered_statement = ruleset_section
            .named_child(1)
            .expect("missing recovered Ruleset statement");
        let rule_section = root.named_child(1).expect("missing recovered Rule section");

        assert!(malformed_header.has_error());
        assert_eq!(recovered_statement.kind(), "ordered_comma_statement");
        assert_eq!(
            &source[recovered_statement.byte_range()],
            "DOMAIN,valid.example"
        );
        assert!(!recovered_statement.has_error());
        assert_eq!(rule_section.kind(), "rule_section");
        assert_eq!(&source[rule_section.byte_range()], "[Rule]\nFINAL,DIRECT");
        assert!(!rule_section.has_error());
        assert!(root.has_error());
    }

    #[test]
    fn logical_rule_fields_preserve_recursive_source_ranges() {
        let source =
            "[Rule]\nAND,((DOMAIN,example.com),(NOT,((PROTOCOL,UDP)))),DIRECT,pre-matching\n";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let section = tree.root_node().named_child(0).expect("missing section");
        let rule = section.named_child(1).expect("missing logical rule");
        let condition = rule
            .child_by_field_name("condition")
            .expect("missing logical condition");
        let operator = condition
            .child_by_field_name("operator")
            .expect("missing logical operator");
        let mut operand_cursor = condition.walk();
        let operands: Vec<_> = condition
            .children_by_field_name("operand", &mut operand_cursor)
            .collect();
        let nested_expression = operands[1]
            .child_by_field_name("expression")
            .expect("missing nested logical expression");
        let policy = rule
            .child_by_field_name("policy")
            .expect("missing logical rule policy");
        let option = rule
            .child_by_field_name("option")
            .expect("missing logical rule option");

        assert_eq!(rule.kind(), "logical_rule");
        assert_eq!(&source[operator.byte_range()], "AND");
        assert_eq!(&source[operands[0].byte_range()], "(DOMAIN,example.com)");
        assert_eq!(nested_expression.kind(), "logical_rule_expression");
        assert_eq!(
            &source[nested_expression.byte_range()],
            "NOT,((PROTOCOL,UDP))"
        );
        assert_eq!(&source[policy.byte_range()], "DIRECT");
        assert_eq!(&source[option.byte_range()], "pre-matching");
        assert!(!tree.root_node().has_error());
    }

    #[test]
    fn ruleset_logical_rule_fields_preserve_recursive_source_ranges() {
        let source = "[Ruleset Combined]\nAND,((DOMAIN,example.com),(NOT,((PROTOCOL,TCP))))\n";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let section = tree.root_node().named_child(0).expect("missing section");
        let rule = section
            .named_child(1)
            .expect("missing Ruleset logical rule");
        let condition = rule
            .child_by_field_name("condition")
            .expect("missing logical condition");
        let operator = condition
            .child_by_field_name("operator")
            .expect("missing logical operator");
        let mut operand_cursor = condition.walk();
        let operands: Vec<_> = condition
            .children_by_field_name("operand", &mut operand_cursor)
            .collect();
        let nested_expression = operands[1]
            .child_by_field_name("expression")
            .expect("missing nested logical expression");

        assert_eq!(rule.kind(), "ruleset_logical_rule");
        assert_eq!(
            &source[condition.byte_range()],
            "AND,((DOMAIN,example.com),(NOT,((PROTOCOL,TCP))))"
        );
        assert_eq!(&source[operator.byte_range()], "AND");
        assert_eq!(&source[operands[0].byte_range()], "(DOMAIN,example.com)");
        assert_eq!(nested_expression.kind(), "logical_rule_expression");
        assert_eq!(
            &source[nested_expression.byte_range()],
            "NOT,((PROTOCOL,TCP))"
        );
        assert!(rule.child_by_field_name("policy").is_none());
        assert!(!tree.root_node().has_error());
    }

    #[test]
    fn requirement_fields_preserve_expression_and_body_ranges() {
        let source = "[General]\n#!REQUIREMENT \"CORE_VERSION>=6008000 AND SYSTEM=='macOS'\" feature = enabled\n";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let section = tree.root_node().named_child(0).expect("missing section");
        let conditional = section
            .named_child(1)
            .expect("missing conditional statement");
        let condition = conditional
            .child_by_field_name("condition")
            .expect("missing line requirement");
        let quoted_expression = condition
            .child_by_field_name("expression")
            .expect("missing quoted requirement expression");
        let expression = quoted_expression
            .child_by_field_name("expression")
            .expect("missing requirement expression");
        let operator = expression
            .child_by_field_name("operator")
            .expect("missing boolean operator");
        let body = conditional
            .child_by_field_name("body")
            .expect("missing conditional body");

        assert_eq!(conditional.kind(), "conditional_statement");
        assert_eq!(condition.kind(), "requirement_prefix");
        assert_eq!(expression.kind(), "requirement_binary_expression");
        assert_eq!(&source[operator.byte_range()], "AND");
        assert_eq!(&source[body.byte_range()], "feature = enabled");
        assert!(!tree.root_node().has_error());
    }

    #[test]
    fn module_syntax_preserves_directive_merge_and_placeholder_ranges() {
        let source = "#!arguments=hostname=example.com&path=%default_path%\n[General]\nurl = %INSERT% \"https://%hostname%/%path%\"\n";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let root = tree.root_node();
        let arguments_directive = root.named_child(0).expect("missing arguments directive");
        let mut argument_cursor = arguments_directive.walk();
        let arguments: Vec<_> = arguments_directive
            .children_by_field_name("argument", &mut argument_cursor)
            .collect();
        let default_placeholder = arguments[1]
            .child_by_field_name("default")
            .and_then(|default| default.named_child(0))
            .expect("missing default placeholder");
        let section = root.named_child(1).expect("missing General section");
        let assignment = section.named_child(1).expect("missing assignment");
        let merge = assignment
            .child_by_field_name("value")
            .expect("missing merge value");
        let operator = merge
            .child_by_field_name("operator")
            .expect("missing merge operator");
        let value = merge
            .child_by_field_name("value")
            .expect("missing merged value");
        let mut value_cursor = value.walk();
        let placeholders: Vec<_> = value
            .named_children(&mut value_cursor)
            .filter(|node| node.kind() == "module_argument_placeholder")
            .collect();

        assert_eq!(arguments_directive.kind(), "module_arguments_directive");
        assert_eq!(&source[arguments[0].byte_range()], "hostname=example.com");
        assert_eq!(&source[default_placeholder.byte_range()], "%default_path%");
        assert_eq!(merge.kind(), "module_merge_value");
        assert_eq!(&source[operator.byte_range()], "%INSERT%");
        assert_eq!(placeholders.len(), 2);
        assert_eq!(&source[placeholders[0].byte_range()], "%hostname%");
        assert_eq!(&source[placeholders[1].byte_range()], "%path%");
        assert!(!root.has_error());
    }

    #[test]
    fn recursive_syntax_errors_are_bounded_by_physical_lines() {
        let source =
            "[Rule]\nAND,((DOMAIN,a),(DOMAIN,b\nDOMAIN,x,DIRECT\n[General]\nnext = valid\n";
        let tree = parser()
            .parse(source, None)
            .expect("parser returned no tree");
        let root = tree.root_node();
        let rule_section = root.named_child(0).expect("missing Rule section");
        let recovered_rule = rule_section.named_child(2).expect("missing recovered rule");
        let general_section = root
            .named_child(1)
            .expect("missing recovered General section");

        assert!(root.has_error());
        assert_eq!(recovered_rule.kind(), "rule");
        assert_eq!(&source[recovered_rule.byte_range()], "DOMAIN,x,DIRECT");
        assert!(!recovered_rule.has_error());
        assert_eq!(general_section.kind(), "general_section");
        assert!(!general_section.has_error());
    }
}
